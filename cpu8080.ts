/*
 * Precise JS emulator for Intel 8080 CPU.
 *
 * Copyright (C) 2013, 2014 Martin Maly
 *
 * TypeScriptified & modular version by Copyright (C) 2017 Martin Borik
 * Based on BSD-licensed work by Copyright (C) 2008 Chris Double
 *
 * All flags and instructions fixed to provide perfect compatibility
 * with original "silicon" CPU.
 *
 * This emulator passes the Exerciser http://www.idb.me.uk/sunhillow/8080.html
 *
 * Big thanks to Roman Borik (http://pmd85.borik.net).
 * His help lets me achieve such a perfect HW compatibility.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * THIS SOFTWARE IS PROVIDED ``AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES,
 * INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 * DEVELOPERS AND CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
 * PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
 * OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 * WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
 * OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
 * ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
//----------------------------------------------------------------------------
import { toHex4 } from "./utils";

import daaTable from "./tables/daa";
import flagTable from "./tables/flags";
import durationTable from "./tables/duration";
import { auxcarryTable } from "./tables/auxcarry";

const CARRY = 0x01;
const PARITY = 0x04;
const AUXCARRY = 0x10;
const ZERO = 0x40;
const SIGN = 0x80;
//----------------------------------------------------------------------------
export default class Cpu8080 {
	// registers
	private b: number = 0;
	private c: number = 0;
	private d: number = 0;
	private e: number = 0;
	private f: number = 0;
	private h: number = 0;
	private l: number = 0;
	private a: number = 0;
	private _pc: number = 0;
	private _sp: number = 0xF000;

	// register-pairs
	get af(): number {
		return ((this.a & 0xff) << 8) | (this.f & 0xff);
	}
	set af(n: number) {
		this.a = (n >> 8) & 0xff;
		this.f = n & 0xff;
	}
	get bc(): number {
		return ((this.b & 0xff) << 8) | (this.c & 0xff);
	}
	set bc(n: number) {
		this.b = (n >> 8) & 0xff;
		this.c = n & 0xff;
	}
	get de(): number {
		return ((this.d & 0xff) << 8) | (this.e & 0xff);
	}
	set de(n: number) {
		this.d = (n >> 8) & 0xff;
		this.e = n & 0xff;
	}
	get hl(): number {
		return ((this.h & 0xff) << 8) | (this.l & 0xff);
	}
	set hl(n: number) {
		this.h = (n >> 8) & 0xff;
		this.l = n & 0xff;
	}
	get pc(): number {
		return this._pc;
	}
	set pc(n: number) {
		this._pc = n & 0xffff;
	}
	get sp(): number {
		return this._sp;
	}
	set sp(n: number) {
		this._sp = n & 0xffff;
	}

	public flagSet(flag: number): void {
		this.f |= flag;
	}
	public flagClear(flag: number): void {
		this.f &= ~flag & 0xff;
	}

	public set(reg: string, value: number): void {
		const regMap = [
			"a", "f", "af",
			"b", "c", "bc",
			"d", "e", "de",
			"h", "l", "hl",
			"pc", "sp"
		];

		reg = reg.toLowerCase();
		if (~regMap.indexOf(reg)) {
			if (reg.length === 2) {
				this[`_${reg}`] = value & 0xffff;
			}
			else {
				this[reg] = value & 0xff;
			}
		}
	}

	// interrupt states
	private inte: boolean = false;
	private halted: boolean = false;

	private cycles: number = 0;
	get T(): number { return this.cycles; }


	constructor(
		private onByteWrite, private onByteRead,
		private onPortOut?, private onPortIn?) {

		this.reset();
	}

	public reset(): void {
		this._pc = 0;
		this._sp = 0;
		this.a = this.b = this.c = this.d = this.e = this.h = this.l = 0;
		this.f = 0x02;
		this.inte = false;
		this.halted = false;
		this.cycles = 0;
	}

	// step through one instruction
	public step() {
		if (this.halted) {
			this.cycles++;
			return 1;
		}

		let i = this.onByteRead(this.pc++);
		let inT = this.cycles;

		this.execute(i);
		this.processInterrupts();

		return this.cycles - inT;
	}

	public interrupt(vector: number = 0x38) {
		if (this.inte) {
			this.halted = false;
			this.push(this._pc);
			this.pc = vector;
		}
	}

//----------------------------------------------------------------------------
	private writePort(port: number, v: number): void {
		if (this.onPortOut) {
			this.onPortOut(port & 0xff, v);
		}
	}

	private readPort(port: number): number {
		if (this.onPortIn) {
			return this.onPortIn(port & 0xff);
		}
		return 0xff;
	}

	private getByte(addr: number): number {
		return this.onByteRead(addr & 0xffff);
	}

	private getWord(addr: number): number {
		let l = this.onByteRead(addr & 0xffff);
		let h = this.onByteRead(++addr & 0xffff);
		return (h << 8 | l) & 0xffff;
	}

	private nextByte(): number {
		let pc = this._pc;
		let ret = this.onByteRead(pc & 0xffff);
		this.pc = ++pc;

		return ret & 0xff;
	}

	private nextWord(): number {
		let pc = this._pc;
		let l = this.onByteRead(pc & 0xffff);
		let h = this.onByteRead(++pc & 0xffff);
		this.pc = ++pc;

		return (h << 8 | l) & 0xffff;
	}

	private writeByte(addr: number, value: number): void {
		this.onByteWrite(addr & 0xffff, value & 0xff);
	}

	private writeWord(addr: number, value): void {
		this.writeByte(addr & 0xffff, value);
		this.writeByte((addr + 1) & 0xffff, value >> 8);
	}

	// set flags after arithmetic and logical ops
	private calcFlags(v: number): number {
		let x = v & 0xff;
		this.f = flagTable[x];

		if (v >= 0x100 || v < 0) {
			this.f |= CARRY;
		}
		else {
			this.f &= ~CARRY & 0xff;
		}

		return x;
	}

	private acADD(a1: number, a2: number, r: number): void {
		let dis = (r & 8) >> 1 | (a2 & 8) >> 2 | (a1 & 8) >> 3;
		this.f = this.f & ~AUXCARRY | auxcarryTable.add[dis];
	}

	private acSUB(a1: number, a2: number, r: number): void {
		let dis = (r & 8) >> 1 | (a2 & 8) >> 2 | (a1 & 8) >> 3;
		this.f = this.f & ~AUXCARRY | auxcarryTable.sub[dis];
	}

	private incrementByte(o: number): number {
		let c: number = this.f & CARRY; // carry not affected
		let r: number = this.calcFlags(o + 1);

		this.f = (this.f & ~CARRY & 0xff) | c;
		if ((r & 0x0f) === 0) {
			this.f |= AUXCARRY;
		}
		else {
			this.f &= ~AUXCARRY & 0xff;
		}

		return r;
	}

	private decrementByte(o: number) {
		let c: number = this.f & CARRY; // carry not affected
		let r: number = this.calcFlags(o - 1);

		this.f = (this.f & ~CARRY & 0xff) | c;
		if ((o & 0x0f) > 0) {
			this.f |= AUXCARRY;
		}
		else {
			this.f &= ~AUXCARRY & 0xff;
		}

		return r;
	}

	private addByte(lhs: number, rhs: number): number {
		let mid: number = this.calcFlags(lhs + rhs);
		this.acADD(lhs, rhs, mid);
		return mid;
	}

	private addByteWithCarry(lhs: number, rhs: number): number {
		let nrhs: number = rhs + (this.f & CARRY);
		let mid: number = this.addByte(lhs, nrhs);
		this.acADD(lhs, rhs, mid);
		return mid;
	}

	private subtractByte(lhs: number, rhs: number): number {
		let mid: number = this.calcFlags(lhs - rhs);
		this.acSUB(lhs, rhs, mid);
		return mid;
	}

	private subtractByteWithCarry(lhs: number, rhs: number): number {
		let nrhs: number = rhs + (this.f & CARRY);
		let mid: number = this.calcFlags(lhs - nrhs);
		this.acSUB(lhs, rhs, mid);
		return mid;
	}

	private andByte(lhs: number, rhs: number): number {
		let r = this.calcFlags(lhs & rhs);
		let ac = (lhs & 8) | (rhs & 8);

		if (ac > 0) {
			this.f |= AUXCARRY;
		}
		else {
			this.f &= ~AUXCARRY & 0xff;
		}
		this.f &= ~CARRY & 0xff;

		return r;
	}

	private xorByte(lhs: number, rhs: number): number {
		let r = this.calcFlags(lhs ^ rhs);

		this.f &= ~AUXCARRY & 0xff;
		this.f &= ~CARRY & 0xff;

		return r;
	}

	private orByte(lhs: number, rhs: number): number {
		let r = this.calcFlags(lhs | rhs);

		this.f &= ~AUXCARRY & 0xff;
		this.f &= ~CARRY & 0xff;

		return r;
	}

	private addWord(lhs: number, rhs: number): number {
		let r = lhs + rhs;

		if (r > 0xffff) {
			this.f |= CARRY;
		}
		else {
			this.f &= ~CARRY & 0xff;
		}

		return r & 0xffff;
	}

	private pop(): number {
		let pc = this.getWord(this._sp);
		this.sp += 2;
		return pc;
	}

	private push(v: number): void {
		this.sp += 0xfffe;
		this.writeWord(this._sp, v);
	}


	private processInterrupts() {
		// TODO
	}

	private execute(i) {
		let w: number, c: number;
		let jump: boolean = false;

		this.f &= 0xd7;
		this.f |= 0x02;

		switch (i) {
			// NOP
			default:
				break;

			// LXI B,nn
			case 0x01:
				this.bc = this.nextWord();
				break;

			// STAX B
			case 0x02:
				this.writeByte(this.bc, this.a);
				break;

			// INX B
			case 0x03:
				this.bc++;
				break;

			// INR B
			case 0x04:
				this.b = this.incrementByte(this.b);
				break;

			// DCR B
			case 0x05:
				this.b = this.decrementByte(this.b);
				break;

			// MVI B,n
			case 0x06:
				this.b = this.nextByte();
				break;

			// RLC
			case 0x07:
				{
					c = (this.a & 0x80) >> 7;
					if (c) {
						this.f |= CARRY;
					}
					else {
						this.f &= ~CARRY & 0xff;
					}

					this.a = ((this.a << 1) & 0xfe) | c;
				}
				break;

			// DAD B
			case 0x09:
				this.hl = this.addWord(this.hl, this.bc);
				break;

			// LDAX B
			case 0x0A:
				this.a = this.onByteRead(this.bc);
				break;

			// DCX B
			case 0x0B:
				this.bc += 0xffff;
				break;

			// INR C
			case 0x0C:
				this.c = this.incrementByte(this.c);
				break;

			// DCR C
			case 0x0D:
				this.c = this.decrementByte(this.c);
				break;

			// MVI C,n
			case 0x0E:
				this.c = this.nextByte();
				break;

			// RRC
			case 0x0F:
				{
					c = (this.a & 1) << 7;
					if (c) {
						this.f |= CARRY;
					}
					else {
						this.f &= ~CARRY & 0xff;
					}

					this.a = ((this.a >> 1) & 0x7f) | c;
				}
				break;

			// LXI D,nn
			case 0x11:
				this.de = this.nextWord();
				break;

			// STAX D
			case 0x12:
				this.writeByte(this.de, this.a);
				break;

			// INX D
			case 0x13:
				this.de++;
				break;

			// INR D
			case 0x14:
				this.d = this.incrementByte(this.d);
				break;

			// DCR D
			case 0x15:
				this.d = this.decrementByte(this.d);
				break;

			// MVI D,n
			case 0x16:
				this.d = this.nextByte();
				break;

			// RAL
			case 0x17:
				{
					c = (this.f & CARRY);
					if (this.a & 128) {
						this.f |= CARRY;
					}
					else {
						this.f &= ~CARRY & 0xff;
					}

					this.a = ((this.a << 1) & 0xfe) | c;
				}
				break;

			// DAD D
			case 0x19:
				this.hl = this.addWord(this.hl, this.de);
				break;

			// LDAX D
			case 0x1A:
				this.a = this.onByteRead(this.de);
				break;

			// DCX D
			case 0x1B:
				this.de += 0xffff;
				break;

			// INR E
			case 0x1C:
				this.e = this.incrementByte(this.e);
				break;

			// DCR E
			case 0x1D:
				this.e = this.decrementByte(this.e);
				break;

			// MVI E,n
			case 0x1E:
				this.e = this.nextByte();
				break;

			// RAR
			case 0x1F:
				{
					c = (this.f & CARRY) << 7;
					if (this.a & 1) {
						this.f |= CARRY;
					}
					else {
						this.f &= ~CARRY & 0xff;
					}

					this.a = ((this.a >> 1) & 0x7f) | c;
				}
				break;

			// LXI H,nn
			case 0x21:
				this.hl = this.nextWord();
				break;

			// SHLD nn
			case 0x22:
				this.writeWord(this.nextWord(), this.hl);
				break;

			// INX H
			case 0x23:
				this.hl++;
				break;

			// INR H
			case 0x24:
				this.h = this.incrementByte(this.h);
				break;

			// DCR H
			case 0x25:
				this.h = this.decrementByte(this.h);
				break;

			// MVI H,n
			case 0x26:
				this.h = this.nextByte();
				break;

			// DAA
			case 0x27:
				{
					let temp = this.a;
					if (this.f & CARRY) {
						temp |= 0x100;
					}
					if (this.f & AUXCARRY) {
						temp |= 0x200;
					}

					c = daaTable[temp];
					this.a = (c >> 8) & 0xff;
					this.f = (c & 0xd7) | 0x02;
				}
				break;

			// DAD H
			case 0x29:
				this.hl = this.addWord(this.hl, this.hl);
				break;

			// LHLD nn
			case 0x2A:
				this.hl = this.getWord(this.nextWord());
				break;

			// DCX H
			case 0x2B:
				this.hl += 0xffff;
				break;

			// INR L
			case 0x2C:
				this.l = this.incrementByte(this.l);
				break;

			// DCR L
			case 0x2D:
				this.l = this.decrementByte(this.l);
				break;

			// MVI L,n
			case 0x2E:
				this.l = this.nextByte();
				break;

			// CMA
			case 0x2F:
				this.a ^= 0xFF;
				break;

			// LXI SP,nn
			case 0x31:
				this.sp = this.nextWord();
				break;

			// STA nn
			case 0x32:
				this.writeByte(this.nextWord(), this.a);
				break;

			// INX SP
			case 0x33:
				this.sp++;
				break;

			// INR M
			case 0x34:
				w = this.hl;
				this.writeByte(w, this.incrementByte(this.onByteRead(w)));
				break;

			// DCR M
			case 0x35:
				w = this.hl;
				this.writeByte(w, this.decrementByte(this.onByteRead(w)));
				break;

			// MVI M,n
			case 0x36:
				this.writeByte(this.hl, this.nextByte());
				break;

			// STC
			case 0x37:
				this.f |= CARRY;
				break;

			// DAD SP
			case 0x39:
				this.hl = this.addWord(this.hl, this.sp);
				break;

			// LDA nn
			case 0x3A:
				this.a = this.onByteRead(this.nextWord());
				break;

			// DCX SP
			case 0x3B:
				this.sp += 0xffff;
				break;

			// INR A
			case 0x3C:
				this.a = this.incrementByte(this.a);
				break;

			// DCR A
			case 0x3D:
				this.a = this.decrementByte(this.a);
				break;

			// MVI A,n
			case 0x3E:
				this.a = this.nextByte();
				break;

			// CMC
			case 0x3F:
				this.f ^= CARRY;
				break;

			// MOV B,B
			case 0x40:
				this.b = this.b;
				break;

			// MOV B,C
			case 0x41:
				this.b = this.c;
				break;

			// MOV B,D
			case 0x42:
				this.b = this.d;
				break;

			// MOV B,E
			case 0x43:
				this.b = this.e;
				break;

			// MOV B,H
			case 0x44:
				this.b = this.h;
				break;

			// MOV B,L
			case 0x45:
				this.b = this.l;
				break;

			// MOV B,M
			case 0x46:
				this.b = this.onByteRead(this.hl);
				break;

			// MOV B,A
			case 0x47:
				this.b = this.a;
				break;

			// MOV C,B
			case 0x48:
				this.c = this.b;
				break;

			// MOV C,C
			case 0x49:
				this.c = this.c;
				break;

			// MOV C,D
			case 0x4A:
				this.c = this.d;
				break;

			// MOV C,E
			case 0x4B:
				this.c = this.e;
				break;

			// MOV C,H
			case 0x4C:
				this.c = this.h;
				break;

			// MOV C,L
			case 0x4D:
				this.c = this.l;
				break;

			// MOV C,M
			case 0x4E:
				this.c = this.onByteRead(this.hl);
				break;

			// MOV C,A
			case 0x4F:
				this.c = this.a;
				break;

			// MOV D,B
			case 0x50:
				this.d = this.b;
				break;

			// MOV D,C
			case 0x51:
				this.d = this.c;
				break;

			// MOV D,D
			case 0x52:
				this.d = this.d;
				break;

			// MOV D,E
			case 0x53:
				this.d = this.e;
				break;

			// MOV D,H
			case 0x54:
				this.d = this.h;
				break;

			// MOV D,L
			case 0x55:
				this.d = this.l;
				break;

			// MOV D,M
			case 0x56:
				this.d = this.onByteRead(this.hl);
				break;

			// MOV D,A
			case 0x57:
				this.d = this.a;
				break;

			// MOV E,B
			case 0x58:
				this.e = this.b;
				break;

			// MOV E,C
			case 0x59:
				this.e = this.c;
				break;

			// MOV E,D
			case 0x5A:
				this.e = this.d;
				break;

			// MOV E,E
			case 0x5B:
				this.e = this.e;
				break;

			// MOV E,H
			case 0x5C:
				this.e = this.h;
				break;

			// MOV E,L
			case 0x5D:
				this.e = this.l;
				break;

			// MOV E,M
			case 0x5E:
				this.e = this.onByteRead(this.hl);
				break;

			// MOV E,A
			case 0x5F:
				this.e = this.a;
				break;

			// MOV H,B
			case 0x60:
				this.h = this.b;
				break;

			// MOV H,C
			case 0x61:
				this.h = this.c;
				break;

			// MOV H,D
			case 0x62:
				this.h = this.d;
				break;

			// MOV H,E
			case 0x63:
				this.h = this.e;
				break;

			// MOV H,H
			case 0x64:
				this.h = this.h;
				break;

			// MOV H,L
			case 0x65:
				this.h = this.l;
				break;

			// MOV H,M
			case 0x66:
				this.h = this.onByteRead(this.hl);
				break;

			// MOV H,A
			case 0x67:
				this.h = this.a;
				break;

			// MOV L,B
			case 0x68:
				this.l = this.b;
				break;

			// MOV L,C
			case 0x69:
				this.l = this.c;
				break;

			// MOV L,D
			case 0x6A:
				this.l = this.d;
				break;

			// MOV L,E
			case 0x6B:
				this.l = this.e;
				break;

			// MOV L,H
			case 0x6C:
				this.l = this.h;
				break;

			// MOV L,L
			case 0x6D:
				this.l = this.l;
				break;

			// MOV L,M
			case 0x6E:
				this.l = this.onByteRead(this.hl);
				break;

			// MOV L,A
			case 0x6F:
				this.l = this.a;
				break;

			// MOV M,B
			case 0x70:
				this.writeByte(this.hl, this.b);
				break;

			// MOV M,C
			case 0x71:
				this.writeByte(this.hl, this.c);
				break;

			// MOV M,D
			case 0x72:
				this.writeByte(this.hl, this.d);
				break;

			// MOV M,E
			case 0x73:
				this.writeByte(this.hl, this.e);
				break;

			// MOV M,H
			case 0x74:
				this.writeByte(this.hl, this.h);
				break;

			// MOV M,L
			case 0x75:
				this.writeByte(this.hl, this.l);
				break;

			// HLT
			case 0x76:
				this.halted = true;
				break;

			// MOV M,A
			case 0x77:
				this.writeByte(this.hl, this.a);
				break;

			// MOV A,B
			case 0x78:
				this.a = this.b;
				break;

			// MOV A,C
			case 0x79:
				this.a = this.c;
				break;

			// MOV A,D
			case 0x7A:
				this.a = this.d;
				break;

			// MOV A,E
			case 0x7B:
				this.a = this.e;
				break;

			// MOV A,H
			case 0x7C:
				this.a = this.h;
				break;

			// MOV A,L
			case 0x7D:
				this.a = this.l;
				break;

			// MOV A,M
			case 0x7E:
				this.a = this.onByteRead(this.hl);
				break;

			// MOV A,A
			case 0x7F:
				this.a = this.a;
				break;

			// ADD A,B
			case 0x80:
				this.a = this.addByte(this.a, this.b);
				break;

			// ADD A,C
			case 0x81:
				this.a = this.addByte(this.a, this.c);
				break;

			// ADD A,D
			case 0x82:
				this.a = this.addByte(this.a, this.d);
				break;

			// ADD A,E
			case 0x83:
				this.a = this.addByte(this.a, this.e);
				break;

			// ADD A,H
			case 0x84:
				this.a = this.addByte(this.a, this.h);
				break;

			// ADD A,L
			case 0x85:
				this.a = this.addByte(this.a, this.l);
				break;

			// ADD A,M
			case 0x86:
				this.a = this.addByte(this.a, this.onByteRead(this.hl));
				break;

			// ADD A,A
			case 0x87:
				this.a = this.addByte(this.a, this.a);
				break;

			// ADC A,B
			case 0x88:
				this.a = this.addByteWithCarry(this.a, this.b);
				break;

			// ADC A,C
			case 0x89:
				this.a = this.addByteWithCarry(this.a, this.c);
				break;

			// ADC A,D
			case 0x8A:
				this.a = this.addByteWithCarry(this.a, this.d);
				break;

			// ADC A,E
			case 0x8B:
				this.a = this.addByteWithCarry(this.a, this.e);
				break;

			// ADC A,H
			case 0x8C:
				this.a = this.addByteWithCarry(this.a, this.h);
				break;

			// ADC A,L
			case 0x8D:
				this.a = this.addByteWithCarry(this.a, this.l);
				break;

			// ADC A,M
			case 0x8E:
				this.a = this.addByteWithCarry(this.a, this.onByteRead(this.hl));
				break;

			// ADC A,A
			case 0x8F:
				this.a = this.addByteWithCarry(this.a, this.a);
				break;

			// SUB B
			case 0x90:
				this.a = this.subtractByte(this.a, this.b);
				break;

			// SUB C
			case 0x91:
				this.a = this.subtractByte(this.a, this.c);
				break;

			// SUB D
			case 0x92:
				this.a = this.subtractByte(this.a, this.d);
				break;

			// SUB E
			case 0x93:
				this.a = this.subtractByte(this.a, this.e);
				break;

			// SUB H
			case 0x94:
				this.a = this.subtractByte(this.a, this.h);
				break;

			// SUB L
			case 0x95:
				this.a = this.subtractByte(this.a, this.l);
				break;

			// SUB M
			case 0x96:
				this.a = this.subtractByte(this.a, this.onByteRead(this.hl));
				break;

			// SUB A
			case 0x97:
				this.a = this.subtractByte(this.a, this.a);
				break;

			// SBB B
			case 0x98:
				this.a = this.subtractByteWithCarry(this.a, this.b);
				break;

			// SBB C
			case 0x99:
				this.a = this.subtractByteWithCarry(this.a, this.c);
				break;

			// SBB D
			case 0x9A:
				this.a = this.subtractByteWithCarry(this.a, this.d);
				break;

			// SBB E
			case 0x9B:
				this.a = this.subtractByteWithCarry(this.a, this.e);
				break;

			// SBB H
			case 0x9C:
				this.a = this.subtractByteWithCarry(this.a, this.h);
				break;

			// SBB L
			case 0x9D:
				this.a = this.subtractByteWithCarry(this.a, this.l);
				break;

			// SBB M
			case 0x9E:
				this.a = this.subtractByteWithCarry(this.a, this.onByteRead(this.hl));
				break;

			// SBB A
			case 0x9F:
				this.a = this.subtractByteWithCarry(this.a, this.a);
				break;

			// ANA B
			case 0xA0:
				this.a = this.andByte(this.a, this.b);
				break;

			// ANA C
			case 0xA1:
				this.a = this.andByte(this.a, this.c);
				break;

			// ANA D
			case 0xA2:
				this.a = this.andByte(this.a, this.d);
				break;

			// ANA E
			case 0xA3:
				this.a = this.andByte(this.a, this.e);
				break;

			// ANA H
			case 0xA4:
				this.a = this.andByte(this.a, this.h);
				break;

			// ANA L
			case 0xA5:
				this.a = this.andByte(this.a, this.l);
				break;

			// ANA M
			case 0xA6:
				this.a = this.andByte(this.a, this.onByteRead(this.hl));
				break;

			// ANA A
			case 0xA7:
				this.a = this.andByte(this.a, this.a);
				break;

			// XRA B
			case 0xA8:
				this.a = this.xorByte(this.a, this.b);
				break;

			// XRA C
			case 0xA9:
				this.a = this.xorByte(this.a, this.c);
				break;

			// XRA D
			case 0xAA:
				this.a = this.xorByte(this.a, this.d);
				break;

			// XRA E
			case 0xAB:
				this.a = this.xorByte(this.a, this.e);
				break;

			// XRA H
			case 0xAC:
				this.a = this.xorByte(this.a, this.h);
				break;

			// XRA L
			case 0xAD:
				this.a = this.xorByte(this.a, this.l);
				break;

			// XRA M
			case 0xAE:
				this.a = this.xorByte(this.a, this.onByteRead(this.hl));
				break;

			// XRA A
			case 0xAF:
				this.a = this.xorByte(this.a, this.a);
				break;

			// ORA B
			case 0xB0:
				this.a = this.orByte(this.a, this.b);
				break;

			// ORA C
			case 0xB1:
				this.a = this.orByte(this.a, this.c);
				break;

			// ORA D
			case 0xB2:
				this.a = this.orByte(this.a, this.d);
				break;

			// ORA E
			case 0xB3:
				this.a = this.orByte(this.a, this.e);
				break;

			// ORA H
			case 0xB4:
				this.a = this.orByte(this.a, this.h);
				break;

			// ORA L
			case 0xB5:
				this.a = this.orByte(this.a, this.l);
				break;

			// ORA M
			case 0xB6:
				this.a = this.orByte(this.a, this.onByteRead(this.hl));
				break;

			// ORA A
			case 0xB7:
				this.a = this.orByte(this.a, this.a);
				break;

			// CMP B
			case 0xB8:
				this.subtractByte(this.a, this.b);
				break;

			// CMP C
			case 0xB9:
				this.subtractByte(this.a, this.c);
				break;

			// CMP D
			case 0xBA:
				this.subtractByte(this.a, this.d);
				break;

			// CMP E
			case 0xBB:
				this.subtractByte(this.a, this.e);
				break;

			// CMP H
			case 0xBC:
				this.subtractByte(this.a, this.h);
				break;

			// CMP L
			case 0xBD:
				this.subtractByte(this.a, this.l);
				break;

			// CMP M
			case 0xBE:
				this.subtractByte(this.a, this.onByteRead(this.hl));
				break;

			// CMP A
			case 0xBF:
				this.subtractByte(this.a, this.a);
				break;

			// RNZ
			case 0xC0:
				if (!(this.f & ZERO)) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// POP B
			case 0xC1:
				this.bc = this.pop();
				break;

			// JNZ nn
			case 0xC2:
				if (this.f & ZERO) {
					this.pc += 2;
				}
				else {
					this._pc = this.nextWord();
				}
				break;

			// JMP nn
			case 0xC3:
			case 0xCB: // (undocumented)
				this._pc = this.getWord(this._pc);
				break;

			// CNZ nn
			case 0xC4:
				if (this.f & ZERO) {
					this.pc += 2;
				}
				else {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				break;

			// PUSH B
			case 0xC5:
				this.push(this.bc);
				break;

			// ADI n
			case 0xC6:
				this.a = this.addByte(this.a, this.nextByte());
				break;

			// RST 0
			case 0xC7:
				this.push(this._pc);
				this._pc = 0;
				break;

			// RZ
			case 0xC8:
				if (this.f & ZERO) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// RET
			case 0xC9:
			case 0xD9: // (undocumented)
				this._pc = this.pop();
				break;

			// JZ nn
			case 0xCA:
				if (this.f & ZERO) {
					this._pc = this.nextWord();
				}
				else {
					this.pc += 2;
				}
				break;

			// CZ nn
			case 0xCC:
				if (this.f & ZERO) {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				else {
					this.pc += 2;
				}
				break;

			// CALL nn
			case 0xCD:
			case 0xDD: // (undocumented)
			case 0xED: // (undocumented)
			case 0xFD: // (undocumented)
				w = this.nextWord();
				this.push(this._pc);
				this._pc = w;
				break;

			// ACI n
			case 0xCE:
				this.a = this.addByteWithCarry(this.a, this.nextByte());
				break;

			// RST 1
			case 0xCF:
				this.push(this._pc);
				this._pc = 0x08;
				break;

			// RNC
			case 0xD0:
				if (!(this.f & CARRY)) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// POP D
			case 0xD1:
				this.de = this.pop();
				break;

			// JNC nn
			case 0xD2:
				if (this.f & CARRY) {
					this.pc += 2;
				}
				else {
					this._pc = this.nextWord();
				}
				break;

			// OUT n
			case 0xD3:
				this.writePort(this.nextByte(), this.a);
				break;

			// CNC nn
			case 0xD4:
				if (this.f & CARRY) {
					this.pc += 2;
				}
				else {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				break;

			// PUSH D
			case 0xD5:
				this.push(this.de);
				break;

			// SUI n
			case 0xD6:
				this.a = this.subtractByte(this.a, this.nextByte());
				break;

			// RST 2
			case 0xD7:
				this.push(this._pc);
				this._pc = 0x10;
				break;

			// RC
			case 0xD8:
				if (this.f & CARRY) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// JC nn
			case 0xDA:
				if (this.f & CARRY) {
					this._pc = this.nextWord();
				}
				else {
					this.pc += 2;
				}
				break;

			// IN n
			case 0xDB:
				this.a = this.readPort(this.nextByte());
				break;

			// CC nn
			case 0xDC:
				if (this.f & CARRY) {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				else {
					this.pc += 2;
				}
				break;

			// SBI n
			case 0xDE:
				this.a = this.subtractByteWithCarry(this.a, this.nextByte());
				break;

			// RST 3
			case 0xDF:
				this.push(this._pc);
				this._pc = 0x18;
				break;

			// RPO
			case 0xE0:
				if (!(this.f & PARITY)) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// POP H
			case 0xE1:
				this.hl = this.pop();
				break;

			// JPO nn
			case 0xE2:
				if (this.f & PARITY) {
					this.pc += 2;
				}
				else {
					this._pc = this.nextWord();
				}
				break;

			// XTHL
			case 0xE3:
				w = this.getWord(this._sp);
				this.writeWord(this._sp, this.hl);
				this.hl = w;
				break;

			// CPO nn
			case 0xE4:
				if (this.f & PARITY) {
					this.pc += 2;
				}
				else {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				break;

			// PUSH H
			case 0xE5:
				this.push(this.hl);
				break;

			// ANI n
			case 0xE6:
				this.a = this.andByte(this.a, this.nextByte());
				break;

			// RST 4
			case 0xE7:
				this.push(this._pc);
				this._pc = 0x20;
				break;

			// RPE
			case 0xE8:
				if (this.f & PARITY) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// PCHL
			case 0xE9:
				this.pc = this.hl;
				break;

			// JPE nn
			case 0xEA:
				if (this.f & PARITY) {
					this._pc = this.nextWord();
				}
				else {
					this.pc += 2;
				}
				break;

			// XCHG
			case 0xEB:
				w = this.de;
				this.de = this.hl;
				this.hl = w;
				break;

			// CPE nn
			case 0xEC:
				if (this.f & PARITY) {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				else {
					this.pc += 2;
				}
				break;

			// XRI n
			case 0xEE:
				this.a = this.xorByte(this.a, this.nextByte());
				break;

			// RST 5
			case 0xEF:
				this.push(this._pc);
				this._pc = 0x28;
				break;

			// RP
			case 0xF0:
				if (!(this.f & SIGN)) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// POP PSW
			case 0xF1:
				this.af = this.pop();
				break;

			// JP nn
			case 0xF2:
				if (this.f & SIGN) {
					this.pc += 2;
				}
				else {
					this._pc = this.nextWord();
				}
				break;

			// DI
			case 0xF3:
				this.inte = false;
				break;

			// CP nn
			case 0xF4:
				if (this.f & SIGN) {
					this.pc += 2;
				}
				else {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				break;

			// PUSH PSW
			case 0xF5:
				this.push(this.af);
				break;

			// ORI n
			case 0xF6:
				this.a = this.orByte(this.a, this.nextByte());
				break;

			// RST 6
			case 0xF7:
				this.push(this._pc);
				this._pc = 0x30;
				break;

			// RM
			case 0xF8:
				if (this.f & SIGN) {
					this._pc = this.pop();
					jump = true;
				}
				break;

			// SPHL
			case 0xF9:
				this.sp = this.hl;
				break;

			// JM nn
			case 0xFA:
				if (this.f & SIGN) {
					this._pc = this.nextWord();
				}
				else {
					this.pc += 2;
				}
				break;

			// EI
			case 0xFB:
				this.inte = true;
				break;

			// CM nn
			case 0xFC:
				if (this.f & SIGN) {
					w = this.nextWord();
					this.push(this._pc);
					this._pc = w;
					jump = true;
				}
				else {
					this.pc += 2;
				}
				break;

			// CPI n
			case 0xFE:
				this.subtractByte(this.a, this.nextByte());
				break;

			// RST 7
			case 0xFF:
				this.push(this._pc);
				this._pc = 0x38;
				break;
		}

		this.f &= 0xd7;
		this.f |= 0x02;

		this.cycles += durationTable[i] + (jump ? 6 : 0);
	}

//----------------------------------------------------------------------------
	public flagsToString(): string {
		let result = "", fx = "SZ0A0P1C";
		for (let i = 0; i < 8; i++) {
			if (this.f & (0x80 >> i)) {
				result += fx[i];
			}
			else {
				result += fx[i].toLowerCase();
			}
		}

		return result;
	}

	public toString(): string {
		return JSON.stringify({
			pc: toHex4(this._pc),
			sp: toHex4(this._sp),
			af: toHex4(this.af),
			bc: toHex4(this.bc),
			de: toHex4(this.de),
			hl: toHex4(this.hl),
			flags: this.flagsToString()
		}, null, "\t");
	}

	public status() {
		interface ResultObject { [key: string]: number; }
		let result: ResultObject = {
			"pc": this._pc,
			"sp": this._sp,
			"a": this.a, "f": this.f,
			"b": this.b, "c": this.c,
			"d": this.d, "e": this.e,
			"h": this.h, "l": this.l
		};

		return result;
	}
}
