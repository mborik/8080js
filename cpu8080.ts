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
	private pc: number = 0;
	private sp: number = 0xF000;

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
			this[reg] = value;
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
		this.pc = 0;
		this.sp = 0;
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
			this.push(this.pc);
			this.pc = vector & 0xffff;
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
		let pc = this.pc;
		let ret = this.onByteRead(pc & 0xffff);
		this.pc = ++pc & 0xffff;

		return ret & 0xff;
	}

	private nextWord(): number {
		let pc = this.pc;
		let l = this.onByteRead(pc & 0xffff);
		let h = this.onByteRead(++pc & 0xffff);
		this.pc = ++pc & 0xffff;

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
		let pc = this.getWord(this.sp);
		this.sp = (this.sp + 2) & 0xffff;
		return pc;
	}

	private push(v: number): void {
		this.sp = (this.sp - 2) & 0xffff;
		this.writeWord(this.sp, v);
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

			// LD BC,nn
			case 0x01:
				this.bc = this.nextWord();
				break;

			// LD (BC),A
			case 0x02:
				this.writeByte(this.bc, this.a);
				break;

			// INC BC
			case 0x03:
				this.bc = (this.bc + 1) & 0xffff;
				break;

			// INC  B
			case 0x04:
				this.b = this.incrementByte(this.b);
				break;

			// DEC  B
			case 0x05:
				this.b = this.decrementByte(this.b);
				break;

			// LD   B,n
			case 0x06:
				this.b = this.nextByte();
				break;

			// RLCA
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

			// ADD  HL,BC
			case 0x09:
				this.hl = this.addWord(this.hl, this.bc);
				break;

			// LD   A,(BC)
			case 0x0A:
				this.a = this.onByteRead(this.bc);
				break;

			// DEC  BC
			case 0x0B:
				this.bc = (this.bc + 0xffff) & 0xffff;
				break;

			// INC  C
			case 0x0C:
				this.c = this.incrementByte(this.c);
				break;

			// DEC  C
			case 0x0D:
				this.c = this.decrementByte(this.c);
				break;

			// LD   C,n
			case 0x0E:
				this.c = this.nextByte();
				break;

			// RRCA
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

			// LD   DE,nn
			case 0x11:
				this.de = this.nextWord();
				break;

			// LD   (DE),A
			case 0x12:
				this.writeByte(this.de, this.a);
				break;

			// INC  DE
			case 0x13:
				this.de = (this.de + 1) & 0xffff;
				break;

			// INC  D
			case 0x14:
				this.d = this.incrementByte(this.d);
				break;

			// DEC  D
			case 0x15:
				this.d = this.decrementByte(this.d);
				break;

			// LD   D,n
			case 0x16:
				this.d = this.nextByte();
				break;

			// RLA
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

			// ADD  HL,DE
			case 0x19:
				this.hl = this.addWord(this.hl, this.de);
				break;

			// LD   A,(DE)
			case 0x1A:
				this.a = this.onByteRead(this.de);
				break;

			// DEC  DE
			case 0x1B:
				this.de = (this.de - 1) & 0xffff;
				break;

			// INC  E
			case 0x1C:
				this.e = this.incrementByte(this.e);
				break;

			// DEC  E
			case 0x1D:
				this.e = this.decrementByte(this.e);
				break;

			// LD   E,n
			case 0x1E:
				this.e = this.nextByte();
				break;

			// RRA
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

			// LD   HL,nn
			case 0x21:
				this.hl = this.nextWord();
				break;

			// LD   (nn),HL
			case 0x22:
				this.writeWord(this.nextWord(), this.hl);
				break;

			// INC  HL
			case 0x23:
				this.hl = (this.hl + 1) & 0xffff;
				break;

			// INC  H
			case 0x24:
				this.h = this.incrementByte(this.h);
				break;

			// DEC  H
			case 0x25:
				this.h = this.decrementByte(this.h);
				break;

			// LD   H,n
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

			// ADD  HL,HL
			case 0x29:
				this.hl = this.addWord(this.hl, this.hl);
				break;

			// LD   HL,(nn)
			case 0x2A:
				this.hl = this.getWord(this.nextWord());
				break;

			// DEC  HL
			case 0x2B:
				this.hl = (this.hl - 1) & 0xffff;
				break;

			// INC  L
			case 0x2C:
				this.l = this.incrementByte(this.l);
				break;

			// DEC  L
			case 0x2D:
				this.l = this.decrementByte(this.l);
				break;

			// LD   L,n
			case 0x2E:
				this.l = this.nextByte();
				break;

			// CPL
			case 0x2F:
				this.a ^= 0xFF;
				break;

			// LD   SP,nn
			case 0x31:
				this.sp = this.nextWord();
				break;

			// LD   (nn),A
			case 0x32:
				this.writeByte(this.nextWord(), this.a);
				break;

			// INC  SP
			case 0x33:
				this.sp = ((this.sp + 1) & 0xFFFF);
				break;

			// INC  (HL)
			case 0x34:
				w = this.hl;
				this.writeByte(w, this.incrementByte(this.onByteRead(w)));
				break;

			// DEC  (HL)
			case 0x35:
				w = this.hl;
				this.writeByte(w, this.decrementByte(this.onByteRead(w)));
				break;

			// LD   (HL),n
			case 0x36:
				this.writeByte(this.hl, this.nextByte());
				break;

			// SCF
			case 0x37:
				this.f |= CARRY;
				break;

			// ADD  HL,SP
			case 0x39:
				this.hl = this.addWord(this.hl, this.sp);
				break;

			// LD   A,(nn)
			case 0x3A:
				this.a = this.onByteRead(this.nextWord());
				break;

			// DEC  SP
			case 0x3B:
				this.sp = (this.sp + 0xffff) & 0xffff;
				break;

			// INC  A
			case 0x3C:
				this.a = this.incrementByte(this.a);
				break;

			// DEC  A
			case 0x3D:
				this.a = this.decrementByte(this.a);
				break;

			// LD   A,n
			case 0x3E:
				this.a = this.nextByte();
				break;

			// CCF
			case 0x3F:
				this.f ^= CARRY;
				break;

			// LD   B,B
			case 0x40:
				this.b = this.b;
				break;

			//LD   B,C
			case 0x41:
				this.b = this.c;
				break;

			// LD   B,D
			case 0x42:
				this.b = this.d;
				break;

			// LD   B,E
			case 0x43:
				this.b = this.e;
				break;

			// LD   B,H
			case 0x44:
				this.b = this.h;
				break;

			// LD   B,L
			case 0x45:
				this.b = this.l;
				break;

			// LD   B,(HL)
			case 0x46:
				this.b = this.onByteRead(this.hl);
				break;

			// LD   B,A
			case 0x47:
				this.b = this.a;
				break;

			// LD   C,B
			case 0x48:
				this.c = this.b;
				break;

			// LD   C,C
			case 0x49:
				this.c = this.c;
				break;

			// LD   C,D
			case 0x4A:
				this.c = this.d;
				break;

			// LD   C,E
			case 0x4B:
				this.c = this.e;
				break;

			// LD   C,H
			case 0x4C:
				this.c = this.h;
				break;

			// LD   C,L
			case 0x4D:
				this.c = this.l;
				break;

			// LD   C,(HL)
			case 0x4E:
				this.c = this.onByteRead(this.hl);
				break;

			// LD   C,A
			case 0x4F:
				this.c = this.a;
				break;

			// LD   D,B
			case 0x50:
				this.d = this.b;
				break;

			// LD   D,C
			case 0x51:
				this.d = this.c;
				break;

			// LD   D,D
			case 0x52:
				this.d = this.d;
				break;

			// LD   D,E
			case 0x53:
				this.d = this.e;
				break;

			// LD   D,H
			case 0x54:
				this.d = this.h;
				break;

			// LD   D,L
			case 0x55:
				this.d = this.l;
				break;

			// LD   D,(HL)
			case 0x56:
				this.d = this.onByteRead(this.hl);
				break;

			// LD   D,A
			case 0x57:
				this.d = this.a;
				break;

			// LD   E,B
			case 0x58:
				this.e = this.b;
				break;

			// LD   E,C
			case 0x59:
				this.e = this.c;
				break;

			// LD   E,D
			case 0x5A:
				this.e = this.d;
				break;

			// LD   E,E
			case 0x5B:
				this.e = this.e;
				break;

			// LD   E,H
			case 0x5C:
				this.e = this.h;
				break;

			// LD   E,L
			case 0x5D:
				this.e = this.l;
				break;

			// LD   E,(HL)
			case 0x5E:
				this.e = this.onByteRead(this.hl);
				break;

			// LD   E,A
			case 0x5F:
				this.e = this.a;
				break;

			// LD   H,B
			case 0x60:
				this.h = this.b;
				break;

			// LD   H,C
			case 0x61:
				this.h = this.c;
				break;

			// LD   H,D
			case 0x62:
				this.h = this.d;
				break;

			// LD   H,E
			case 0x63:
				this.h = this.e;
				break;

			// LD   H,H
			case 0x64:
				this.h = this.h;
				break;

			// LD   H,L
			case 0x65:
				this.h = this.l;
				break;

			// LD   H,(HL)
			case 0x66:
				this.h = this.onByteRead(this.hl);
				break;

			// LD   H,A
			case 0x67:
				this.h = this.a;
				break;

			// LD   L,B
			case 0x68:
				this.l = this.b;
				break;

			// LD   L,C
			case 0x69:
				this.l = this.c;
				break;

			// LD   L,D
			case 0x6A:
				this.l = this.d;
				break;

			// LD   L,E
			case 0x6B:
				this.l = this.e;
				break;

			// LD   L,H
			case 0x6C:
				this.l = this.h;
				break;

			// LD   L,L
			case 0x6D:
				this.l = this.l;
				break;

			// LD   L,(HL)
			case 0x6E:
				this.l = this.onByteRead(this.hl);
				break;

			// LD   L,A
			case 0x6F:
				this.l = this.a;
				break;


			// LD   (HL),B
			case 0x70:
				this.writeByte(this.hl, this.b);
				break;

			// LD   (HL),C
			case 0x71:
				this.writeByte(this.hl, this.c);
				break;

			// LD   (HL),D
			case 0x72:
				this.writeByte(this.hl, this.d);
				break;

			// LD   (HL),E
			case 0x73:
				this.writeByte(this.hl, this.e);
				break;

			// LD   (HL),H
			case 0x74:
				this.writeByte(this.hl, this.h);
				break;

			// LD   (HL),L
			case 0x75:
				this.writeByte(this.hl, this.l);
				break;

			// HALT
			case 0x76:
				this.halted = true;
				break;

			// LD   (HL),A
			case 0x77:
				this.writeByte(this.hl, this.a);
				break;

			// LD   A,B
			case 0x78:
				this.a = this.b;
				break;

			// LD   A,C
			case 0x79:
				this.a = this.c;
				break;

			// LD   A,D
			case 0x7A:
				this.a = this.d;
				break;

			// LD   A,E
			case 0x7B:
				this.a = this.e;
				break;

			// LD   A,H
			case 0x7C:
				this.a = this.h;
				break;

			// LD   A,L
			case 0x7D:
				this.a = this.l;
				break;

			// LD   A,(HL)
			case 0x7E:
				this.a = this.onByteRead(this.hl);
				break;

			// LD   A,A
			case 0x7F:
				this.a = this.a;
				break;

			// ADD  A,B
			case 0x80:
				this.a = this.addByte(this.a, this.b);
				break;

			// ADD  A,C
			case 0x81:
				this.a = this.addByte(this.a, this.c);
				break;

			// ADD  A,D
			case 0x82:
				this.a = this.addByte(this.a, this.d);
				break;

			// ADD  A,E
			case 0x83:
				this.a = this.addByte(this.a, this.e);
				break;

			// ADD  A,H
			case 0x84:
				this.a = this.addByte(this.a, this.h);
				break;

			// ADD  A,L
			case 0x85:
				this.a = this.addByte(this.a, this.l);
				break;

			// ADD  A,(HL)
			case 0x86:
				this.a = this.addByte(this.a, this.onByteRead(this.hl));
				break;

			// ADD  A,A
			case 0x87:
				this.a = this.addByte(this.a, this.a);
				break;

			// ADC  A,B
			case 0x88:
				this.a = this.addByteWithCarry(this.a, this.b);
				break;

			// ADC  A,C
			case 0x89:
				this.a = this.addByteWithCarry(this.a, this.c);
				break;

			// ADC  A,D
			case 0x8A:
				this.a = this.addByteWithCarry(this.a, this.d);
				break;

			// ADC  A,E
			case 0x8B:
				this.a = this.addByteWithCarry(this.a, this.e);
				break;

			// ADC  A,H
			case 0x8C:
				this.a = this.addByteWithCarry(this.a, this.h);
				break;

			// ADC  A,L
			case 0x8D:
				this.a = this.addByteWithCarry(this.a, this.l);
				break;

			// ADC  A,(HL)
			case 0x8E:
				this.a = this.addByteWithCarry(this.a, this.onByteRead(this.hl));
				break;

			// ADC  A,A
			case 0x8F:
				this.a = this.addByteWithCarry(this.a, this.a);
				break;

			// SUB  B
			case 0x90:
				this.a = this.subtractByte(this.a, this.b);
				break;

			// SUB  C
			case 0x91:
				this.a = this.subtractByte(this.a, this.c);
				break;

			// SUB  D
			case 0x92:
				this.a = this.subtractByte(this.a, this.d);
				break;

			// SUB  E
			case 0x93:
				this.a = this.subtractByte(this.a, this.e);
				break;

			// SUB  H
			case 0x94:
				this.a = this.subtractByte(this.a, this.h);
				break;

			// SUB  L
			case 0x95:
				this.a = this.subtractByte(this.a, this.l);
				break;

			// SUB  (HL)
			case 0x96:
				this.a = this.subtractByte(this.a, this.onByteRead(this.hl));
				break;

			// SUB  A
			case 0x97:
				this.a = this.subtractByte(this.a, this.a);
				break;

			// SBC  A,B
			case 0x98:
				this.a = this.subtractByteWithCarry(this.a, this.b);
				break;

			// SBC  A,C
			case 0x99:
				this.a = this.subtractByteWithCarry(this.a, this.c);
				break;

			// SBC  A,D
			case 0x9A:
				this.a = this.subtractByteWithCarry(this.a, this.d);
				break;

			// SBC  A,E
			case 0x9B:
				this.a = this.subtractByteWithCarry(this.a, this.e);
				break;

			// SBC  A,H
			case 0x9C:
				this.a = this.subtractByteWithCarry(this.a, this.h);
				break;

			// SBC  A,L
			case 0x9D:
				this.a = this.subtractByteWithCarry(this.a, this.l);
				break;

			//  SBC  A,(HL)
			case 0x9E:
				this.a = this.subtractByteWithCarry(this.a, this.onByteRead(this.hl));
				break;

			// SBC  A,A
			case 0x9F:
				this.a = this.subtractByteWithCarry(this.a, this.a);
				break;

			// AND  B
			case 0xA0:
				this.a = this.andByte(this.a, this.b);
				break;

			// AND  C
			case 0xA1:
				this.a = this.andByte(this.a, this.c);
				break;

			// AND  D
			case 0xA2:
				this.a = this.andByte(this.a, this.d);
				break;

			// AND  E
			case 0xA3:
				this.a = this.andByte(this.a, this.e);
				break;

			// AND  H
			case 0xA4:
				this.a = this.andByte(this.a, this.h);
				break;

			// AND  L
			case 0xA5:
				this.a = this.andByte(this.a, this.l);
				break;

			// AND  (HL)
			case 0xA6:
				this.a = this.andByte(this.a, this.onByteRead(this.hl));
				break;

			// AND  A
			case 0xA7:
				this.a = this.andByte(this.a, this.a);
				break;

			// XOR  B
			case 0xA8:
				this.a = this.xorByte(this.a, this.b);
				break;

			// XOR  C
			case 0xA9:
				this.a = this.xorByte(this.a, this.c);
				break;

			// XOR  D
			case 0xAA:
				this.a = this.xorByte(this.a, this.d);
				break;

			// XOR  E
			case 0xAB:
				this.a = this.xorByte(this.a, this.e);
				break;

			// XOR  H
			case 0xAC:
				this.a = this.xorByte(this.a, this.h);
				break;

			// XOR  L
			case 0xAD:
				this.a = this.xorByte(this.a, this.l);
				break;

			// XOR  (HL)
			case 0xAE:
				this.a = this.xorByte(this.a, this.onByteRead(this.hl));
				break;

			// XOR  A
			case 0xAF:
				this.a = this.xorByte(this.a, this.a);
				break;

			// OR  B
			case 0xB0:
				this.a = this.orByte(this.a, this.b);
				break;

			// OR  C
			case 0xB1:
				this.a = this.orByte(this.a, this.c);
				break;

			// OR  D
			case 0xB2:
				this.a = this.orByte(this.a, this.d);
				break;

			// OR  E
			case 0xB3:
				this.a = this.orByte(this.a, this.e);
				break;

			// OR  H
			case 0xB4:
				this.a = this.orByte(this.a, this.h);
				break;

			// OR  L
			case 0xB5:
				this.a = this.orByte(this.a, this.l);
				break;

			//  OR   (HL)
			case 0xB6:
				this.a = this.orByte(this.a, this.onByteRead(this.hl));
				break;

			// OR  A
			case 0xB7:
				this.a = this.orByte(this.a, this.a);
				break;

			//  CP   B
			case 0xB8:
				this.subtractByte(this.a, this.b);
				break;

			//  CP   C
			case 0xB9:
				this.subtractByte(this.a, this.c);
				break;

			//  CP   D
			case 0xBA:
				this.subtractByte(this.a, this.d);
				break;

			//  CP   E
			case 0xBB:
				this.subtractByte(this.a, this.e);
				break;

			//  CP   H
			case 0xBC:
				this.subtractByte(this.a, this.h);
				break;

			//  CP   L
			case 0xBD:
				this.subtractByte(this.a, this.l);
				break;

			// CP   (HL)
			case 0xBE:
				this.subtractByte(this.a, this.onByteRead(this.hl));
				break;

			//  CP   A
			case 0xBF:
				this.subtractByte(this.a, this.a);
				break;

			//  RET  NZ
			case 0xC0:
				if (!(this.f & ZERO)) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			//  POP  BC
			case 0xC1:
				this.bc = this.pop();
				break;

			// JP   NZ,nn
			case 0xC2:
				if (this.f & ZERO) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					this.pc = this.nextWord();
				}
				break;

			//  JP   nn
			case 0xC3:
			case 0xCB: // (undocumented)
				this.pc = this.getWord(this.pc);
				break;

			//  CALL NZ,nn
			case 0xC4:
				if (this.f & ZERO) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				break;

			//  PUSH BC
			case 0xC5:
				this.push(this.bc);
				break;

			//  ADD  A,n
			case 0xC6:
				this.a = this.addByte(this.a, this.nextByte());
				break;

			// RST  0
			case 0xC7:
				this.push(this.pc);
				this.pc = 0;
				break;

			// RET Z
			case 0xC8:
				if (this.f & ZERO) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// RET  nn
			case 0xC9:
			case 0xD9: // (undocumented)
				this.pc = this.pop();
				break;

			// JP   Z,nn
			case 0xCA:
				if (this.f & ZERO) {
					this.pc = this.nextWord();
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			//  CALL Z,nn
			case 0xCC:
				if (this.f & ZERO) {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// CALL nn
			case 0xCD:
			case 0xDD: // (undocumented)
			case 0xED: // (undocumented)
			case 0xFD: // (undocumented)
				w = this.nextWord();
				this.push(this.pc);
				this.pc = w;
				break;

			// ADC  A,n
			case 0xCE:
				this.a = this.addByteWithCarry(this.a, this.nextByte());
				break;

			// RST  8
			case 0xCF:
				this.push(this.pc);
				this.pc = 0x08;
				break;

			// RET NC
			case 0xD0:
				if (!(this.f & CARRY)) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// POP DE
			case 0xD1:
				this.de = this.pop();
				break;

			// JP   NC,nn
			case 0xD2:
				if (this.f & CARRY) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					this.pc = this.nextWord();
				}
				break;

			// OUT  (n),A
			case 0xD3:
				this.writePort(this.nextByte(), this.a);
				break;

			//  CALL NC,nn
			case 0xD4:
				if (this.f & CARRY) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				break;

			//  PUSH DE
			case 0xD5:
				this.push(this.de);
				break;

			// SUB  n
			case 0xD6:
				this.a = this.subtractByte(this.a, this.nextByte());
				break;

			// RST  10H
			case 0xD7:
				this.push(this.pc);
				this.pc = 0x10;
				break;

			// RET C
			case 0xD8:
				if (this.f & CARRY) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// JP   C,nn
			case 0xDA:
				if (this.f & CARRY) {
					this.pc = this.nextWord();
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// IN   A,(n)
			case 0xDB:
				this.a = this.readPort(this.nextByte());
				break;

			//  CALL C,nn
			case 0xDC:
				if (this.f & CARRY) {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// SBC  A,n
			case 0xDE:
				this.a = this.subtractByteWithCarry(this.a, this.nextByte());
				break;

			// RST  18H
			case 0xDF:
				this.push(this.pc);
				this.pc = 0x18;
				break;

			// RET PO
			case 0xE0:
				if (!(this.f & PARITY)) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// POP HL
			case 0xE1:
				this.hl = this.pop();
				break;

			// JP   PO,nn
			case 0xE2:
				if (this.f & PARITY) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					this.pc = this.nextWord();
				}
				break;

			// EX   (SP),HL
			case 0xE3:
				w = this.getWord(this.sp);
				this.writeWord(this.sp, this.hl);
				this.hl = w;
				break;

			//  CALL PO,nn
			case 0xE4:
				if (this.f & PARITY) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				break;

			//  PUSH HL
			case 0xE5:
				this.push(this.hl);
				break;

			// AND  n
			case 0xE6:
				this.a = this.andByte(this.a, this.nextByte());
				break;

			// RST  20H
			case 0xE7:
				this.push(this.pc);
				this.pc = 0x20;
				break;

			// RET PE
			case 0xE8:
				if (this.f & PARITY) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// JP   (HL)
			case 0xE9:
				this.pc = this.hl;
				break;

			// JP   PE,nn
			case 0xEA:
				if (this.f & PARITY) {
					this.pc = this.nextWord();
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// EX   DE,HL
			case 0xEB:
				w = this.de;
				this.de = this.hl;
				this.hl = w;
				break;

			//  CALL PE,nn
			case 0xEC:
				if (this.f & PARITY) {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// XOR  n
			case 0xEE:
				this.a = this.xorByte(this.a, this.nextByte());
				break;

			// RST  28H
			case 0xEF:
				this.push(this.pc);
				this.pc = 0x28;
				break;

			// RET P
			case 0xF0:
				if (!(this.f & SIGN)) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// POP AF
			case 0xF1:
				this.af = this.pop();
				break;

			// JP   P,nn
			case 0xF2:
				if (this.f & SIGN) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					this.pc = this.nextWord();
				}
				break;

			// DI
			case 0xF3:
				this.inte = false;
				break;

			//  CALL P,nn
			case 0xF4:
				if (this.f & SIGN) {
					this.pc = (this.pc + 2) & 0xffff;
				}
				else {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				break;

			//  PUSH AF
			case 0xF5:
				this.push(this.af);
				break;

			// OR   n
			case 0xF6:
				this.a = this.orByte(this.a, this.nextByte());
				break;

			// RST  30H
			case 0xF7:
				this.push(this.pc);
				this.pc = 0x30;
				break;

			// RET M
			case 0xF8:
				if (this.f & SIGN) {
					this.pc = this.pop();
					jump = true;
				}
				break;

			// LD   SP,HL
			case 0xF9:
				this.sp = this.hl;
				break;

			// JP   M,nn
			case 0xFA:
				if (this.f & SIGN) {
					this.pc = this.nextWord();
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// EI
			case 0xFB:
				this.inte = true;
				break;

			//  CALL M,nn
			case 0xFC:
				if (this.f & SIGN) {
					w = this.nextWord();
					this.push(this.pc);
					this.pc = w;
					jump = true;
				}
				else {
					this.pc = (this.pc + 2) & 0xffff;
				}
				break;

			// CP   n
			case 0xFE:
				this.subtractByte(this.a, this.nextByte());
				break;

			// RST  38H
			case 0xFF:
				this.push(this.pc);
				this.pc = 0x38;
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
			af: toHex4(this.af),
			bc: toHex4(this.bc),
			de: toHex4(this.de),
			hl: toHex4(this.hl),
			pc: toHex4(this.pc),
			sp: toHex4(this.sp),
			flags: this.flagsToString()
		}, null, "\t");
	}

	public status() {
		interface ResultObject { [key: string]: number; }
		let result: ResultObject = {
			"pc": this.pc,
			"sp": this.sp,
			"a": this.a, "f": this.f,
			"b": this.b, "c": this.c,
			"d": this.d, "e": this.e,
			"h": this.h, "l": this.l
		};

		return result;
	}
}
