(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var utils_1 = require("./utils");
var daa_1 = require("./tables/daa");
var flags_1 = require("./tables/flags");
var duration_1 = require("./tables/duration");
var auxcarry_1 = require("./tables/auxcarry");
var CARRY = 0x01;
var PARITY = 0x04;
var AUXCARRY = 0x10;
var ZERO = 0x40;
var SIGN = 0x80;
var Cpu8080 = (function () {
    function Cpu8080(onByteWrite, onByteRead, onPortOut, onPortIn) {
        this.onByteWrite = onByteWrite;
        this.onByteRead = onByteRead;
        this.onPortOut = onPortOut;
        this.onPortIn = onPortIn;
        this.b = 0;
        this.c = 0;
        this.d = 0;
        this.e = 0;
        this.f = 0;
        this.h = 0;
        this.l = 0;
        this.a = 0;
        this.pc = 0;
        this.sp = 0xF000;
        this.inte = false;
        this.halted = false;
        this.cycles = 0;
        this.reset();
    }
    Object.defineProperty(Cpu8080.prototype, "af", {
        get: function () {
            return ((this.a & 0xff) << 8) | (this.f & 0xff);
        },
        set: function (n) {
            this.a = (n >> 8) & 0xff;
            this.f = n & 0xff;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cpu8080.prototype, "bc", {
        get: function () {
            return ((this.b & 0xff) << 8) | (this.c & 0xff);
        },
        set: function (n) {
            this.b = (n >> 8) & 0xff;
            this.c = n & 0xff;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cpu8080.prototype, "de", {
        get: function () {
            return ((this.d & 0xff) << 8) | (this.e & 0xff);
        },
        set: function (n) {
            this.d = (n >> 8) & 0xff;
            this.e = n & 0xff;
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(Cpu8080.prototype, "hl", {
        get: function () {
            return ((this.h & 0xff) << 8) | (this.l & 0xff);
        },
        set: function (n) {
            this.h = (n >> 8) & 0xff;
            this.l = n & 0xff;
        },
        enumerable: true,
        configurable: true
    });
    Cpu8080.prototype.flagSet = function (flag) {
        this.f |= flag;
    };
    Cpu8080.prototype.flagClear = function (flag) {
        this.f &= ~flag & 0xff;
    };
    Cpu8080.prototype.set = function (reg, value) {
        var regMap = [
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
    };
    Object.defineProperty(Cpu8080.prototype, "T", {
        get: function () { return this.cycles; },
        enumerable: true,
        configurable: true
    });
    Cpu8080.prototype.reset = function () {
        this.pc = 0;
        this.sp = 0;
        this.a = this.b = this.c = this.d = this.e = this.h = this.l = 0;
        this.f = 0x02;
        this.inte = false;
        this.halted = false;
        this.cycles = 0;
    };
    Cpu8080.prototype.step = function () {
        if (this.halted) {
            this.cycles++;
            return 1;
        }
        var i = this.onByteRead(this.pc++);
        var inT = this.cycles;
        this.execute(i);
        this.processInterrupts();
        return this.cycles - inT;
    };
    Cpu8080.prototype.interrupt = function (vector) {
        if (vector === void 0) { vector = 0x38; }
        if (this.inte) {
            this.halted = false;
            this.push(this.pc);
            this.pc = vector & 0xffff;
        }
    };
    Cpu8080.prototype.writePort = function (port, v) {
        if (this.onPortOut) {
            this.onPortOut(port & 0xff, v);
        }
    };
    Cpu8080.prototype.readPort = function (port) {
        if (this.onPortIn) {
            return this.onPortIn(port & 0xff);
        }
        return 0xff;
    };
    Cpu8080.prototype.getByte = function (addr) {
        return this.onByteRead(addr & 0xffff);
    };
    Cpu8080.prototype.getWord = function (addr) {
        var l = this.onByteRead(addr & 0xffff);
        var h = this.onByteRead(++addr & 0xffff);
        return (h << 8 | l) & 0xffff;
    };
    Cpu8080.prototype.nextByte = function () {
        var pc = this.pc;
        var ret = this.onByteRead(pc & 0xffff);
        this.pc = ++pc & 0xffff;
        return ret & 0xff;
    };
    Cpu8080.prototype.nextWord = function () {
        var pc = this.pc;
        var l = this.onByteRead(pc & 0xffff);
        var h = this.onByteRead(++pc & 0xffff);
        this.pc = ++pc & 0xffff;
        return (h << 8 | l) & 0xffff;
    };
    Cpu8080.prototype.writeByte = function (addr, value) {
        this.onByteWrite(addr & 0xffff, value & 0xff);
    };
    Cpu8080.prototype.writeWord = function (addr, value) {
        this.writeByte(addr & 0xffff, value);
        this.writeByte((addr + 1) & 0xffff, value >> 8);
    };
    Cpu8080.prototype.calcFlags = function (v) {
        var x = v & 0xff;
        this.f = flags_1.default[x];
        if (v >= 0x100 || v < 0) {
            this.f |= CARRY;
        }
        else {
            this.f &= ~CARRY & 0xff;
        }
        return x;
    };
    Cpu8080.prototype.acADD = function (a1, a2, r) {
        var dis = (r & 8) >> 1 | (a2 & 8) >> 2 | (a1 & 8) >> 3;
        this.f = this.f & ~AUXCARRY | auxcarry_1.auxcarryTable.add[dis];
    };
    Cpu8080.prototype.acSUB = function (a1, a2, r) {
        var dis = (r & 8) >> 1 | (a2 & 8) >> 2 | (a1 & 8) >> 3;
        this.f = this.f & ~AUXCARRY | auxcarry_1.auxcarryTable.sub[dis];
    };
    Cpu8080.prototype.incrementByte = function (o) {
        var c = this.f & CARRY;
        var r = this.calcFlags(o + 1);
        this.f = (this.f & ~CARRY & 0xff) | c;
        if ((r & 0x0f) === 0) {
            this.f |= AUXCARRY;
        }
        else {
            this.f &= ~AUXCARRY & 0xff;
        }
        return r;
    };
    Cpu8080.prototype.decrementByte = function (o) {
        var c = this.f & CARRY;
        var r = this.calcFlags(o - 1);
        this.f = (this.f & ~CARRY & 0xff) | c;
        if ((o & 0x0f) > 0) {
            this.f |= AUXCARRY;
        }
        else {
            this.f &= ~AUXCARRY & 0xff;
        }
        return r;
    };
    Cpu8080.prototype.addByte = function (lhs, rhs) {
        var mid = this.calcFlags(lhs + rhs);
        this.acADD(lhs, rhs, mid);
        return mid;
    };
    Cpu8080.prototype.addByteWithCarry = function (lhs, rhs) {
        var nrhs = rhs + (this.f & CARRY);
        var mid = this.addByte(lhs, nrhs);
        this.acADD(lhs, rhs, mid);
        return mid;
    };
    Cpu8080.prototype.subtractByte = function (lhs, rhs) {
        var mid = this.calcFlags(lhs - rhs);
        this.acSUB(lhs, rhs, mid);
        return mid;
    };
    Cpu8080.prototype.subtractByteWithCarry = function (lhs, rhs) {
        var nrhs = rhs + (this.f & CARRY);
        var mid = this.calcFlags(lhs - nrhs);
        this.acSUB(lhs, rhs, mid);
        return mid;
    };
    Cpu8080.prototype.andByte = function (lhs, rhs) {
        var r = this.calcFlags(lhs & rhs);
        var ac = (lhs & 8) | (rhs & 8);
        if (ac > 0) {
            this.f |= AUXCARRY;
        }
        else {
            this.f &= ~AUXCARRY & 0xff;
        }
        this.f &= ~CARRY & 0xff;
        return r;
    };
    Cpu8080.prototype.xorByte = function (lhs, rhs) {
        var r = this.calcFlags(lhs ^ rhs);
        this.f &= ~AUXCARRY & 0xff;
        this.f &= ~CARRY & 0xff;
        return r;
    };
    Cpu8080.prototype.orByte = function (lhs, rhs) {
        var r = this.calcFlags(lhs | rhs);
        this.f &= ~AUXCARRY & 0xff;
        this.f &= ~CARRY & 0xff;
        return r;
    };
    Cpu8080.prototype.addWord = function (lhs, rhs) {
        var r = lhs + rhs;
        if (r > 0xffff) {
            this.f |= CARRY;
        }
        else {
            this.f &= ~CARRY & 0xff;
        }
        return r & 0xffff;
    };
    Cpu8080.prototype.pop = function () {
        var pc = this.getWord(this.sp);
        this.sp = (this.sp + 2) & 0xffff;
        return pc;
    };
    Cpu8080.prototype.push = function (v) {
        this.sp = (this.sp - 2) & 0xffff;
        this.writeWord(this.sp, v);
    };
    Cpu8080.prototype.processInterrupts = function () {
    };
    Cpu8080.prototype.execute = function (i) {
        var w, c;
        var jump = false;
        this.f &= 0xd7;
        this.f |= 0x02;
        switch (i) {
            default:
                break;
            case 0x01:
                this.bc = this.nextWord();
                break;
            case 0x02:
                this.writeByte(this.bc, this.a);
                break;
            case 0x03:
                this.bc = (this.bc + 1) & 0xffff;
                break;
            case 0x04:
                this.b = this.incrementByte(this.b);
                break;
            case 0x05:
                this.b = this.decrementByte(this.b);
                break;
            case 0x06:
                this.b = this.nextByte();
                break;
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
            case 0x09:
                this.hl = this.addWord(this.hl, this.bc);
                break;
            case 0x0A:
                this.a = this.onByteRead(this.bc);
                break;
            case 0x0B:
                this.bc = (this.bc + 0xffff) & 0xffff;
                break;
            case 0x0C:
                this.c = this.incrementByte(this.c);
                break;
            case 0x0D:
                this.c = this.decrementByte(this.c);
                break;
            case 0x0E:
                this.c = this.nextByte();
                break;
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
            case 0x11:
                this.de = this.nextWord();
                break;
            case 0x12:
                this.writeByte(this.de, this.a);
                break;
            case 0x13:
                this.de = (this.de + 1) & 0xffff;
                break;
            case 0x14:
                this.d = this.incrementByte(this.d);
                break;
            case 0x15:
                this.d = this.decrementByte(this.d);
                break;
            case 0x16:
                this.d = this.nextByte();
                break;
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
            case 0x19:
                this.hl = this.addWord(this.hl, this.de);
                break;
            case 0x1A:
                this.a = this.onByteRead(this.de);
                break;
            case 0x1B:
                this.de = (this.de - 1) & 0xffff;
                break;
            case 0x1C:
                this.e = this.incrementByte(this.e);
                break;
            case 0x1D:
                this.e = this.decrementByte(this.e);
                break;
            case 0x1E:
                this.e = this.nextByte();
                break;
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
            case 0x21:
                this.hl = this.nextWord();
                break;
            case 0x22:
                this.writeWord(this.nextWord(), this.hl);
                break;
            case 0x23:
                this.hl = (this.hl + 1) & 0xffff;
                break;
            case 0x24:
                this.h = this.incrementByte(this.h);
                break;
            case 0x25:
                this.h = this.decrementByte(this.h);
                break;
            case 0x26:
                this.h = this.nextByte();
                break;
            case 0x27:
                {
                    var temp = this.a;
                    if (this.f & CARRY) {
                        temp |= 0x100;
                    }
                    if (this.f & AUXCARRY) {
                        temp |= 0x200;
                    }
                    c = daa_1.default[temp];
                    this.a = (c >> 8) & 0xff;
                    this.f = (c & 0xd7) | 0x02;
                }
                break;
            case 0x29:
                this.hl = this.addWord(this.hl, this.hl);
                break;
            case 0x2A:
                this.hl = this.getWord(this.nextWord());
                break;
            case 0x2B:
                this.hl = (this.hl - 1) & 0xffff;
                break;
            case 0x2C:
                this.l = this.incrementByte(this.l);
                break;
            case 0x2D:
                this.l = this.decrementByte(this.l);
                break;
            case 0x2E:
                this.l = this.nextByte();
                break;
            case 0x2F:
                this.a ^= 0xFF;
                break;
            case 0x31:
                this.sp = this.nextWord();
                break;
            case 0x32:
                this.writeByte(this.nextWord(), this.a);
                break;
            case 0x33:
                this.sp = ((this.sp + 1) & 0xFFFF);
                break;
            case 0x34:
                w = this.hl;
                this.writeByte(w, this.incrementByte(this.onByteRead(w)));
                break;
            case 0x35:
                w = this.hl;
                this.writeByte(w, this.decrementByte(this.onByteRead(w)));
                break;
            case 0x36:
                this.writeByte(this.hl, this.nextByte());
                break;
            case 0x37:
                this.f |= CARRY;
                break;
            case 0x39:
                this.hl = this.addWord(this.hl, this.sp);
                break;
            case 0x3A:
                this.a = this.onByteRead(this.nextWord());
                break;
            case 0x3B:
                this.sp = (this.sp + 0xffff) & 0xffff;
                break;
            case 0x3C:
                this.a = this.incrementByte(this.a);
                break;
            case 0x3D:
                this.a = this.decrementByte(this.a);
                break;
            case 0x3E:
                this.a = this.nextByte();
                break;
            case 0x3F:
                this.f ^= CARRY;
                break;
            case 0x40:
                this.b = this.b;
                break;
            case 0x41:
                this.b = this.c;
                break;
            case 0x42:
                this.b = this.d;
                break;
            case 0x43:
                this.b = this.e;
                break;
            case 0x44:
                this.b = this.h;
                break;
            case 0x45:
                this.b = this.l;
                break;
            case 0x46:
                this.b = this.onByteRead(this.hl);
                break;
            case 0x47:
                this.b = this.a;
                break;
            case 0x48:
                this.c = this.b;
                break;
            case 0x49:
                this.c = this.c;
                break;
            case 0x4A:
                this.c = this.d;
                break;
            case 0x4B:
                this.c = this.e;
                break;
            case 0x4C:
                this.c = this.h;
                break;
            case 0x4D:
                this.c = this.l;
                break;
            case 0x4E:
                this.c = this.onByteRead(this.hl);
                break;
            case 0x4F:
                this.c = this.a;
                break;
            case 0x50:
                this.d = this.b;
                break;
            case 0x51:
                this.d = this.c;
                break;
            case 0x52:
                this.d = this.d;
                break;
            case 0x53:
                this.d = this.e;
                break;
            case 0x54:
                this.d = this.h;
                break;
            case 0x55:
                this.d = this.l;
                break;
            case 0x56:
                this.d = this.onByteRead(this.hl);
                break;
            case 0x57:
                this.d = this.a;
                break;
            case 0x58:
                this.e = this.b;
                break;
            case 0x59:
                this.e = this.c;
                break;
            case 0x5A:
                this.e = this.d;
                break;
            case 0x5B:
                this.e = this.e;
                break;
            case 0x5C:
                this.e = this.h;
                break;
            case 0x5D:
                this.e = this.l;
                break;
            case 0x5E:
                this.e = this.onByteRead(this.hl);
                break;
            case 0x5F:
                this.e = this.a;
                break;
            case 0x60:
                this.h = this.b;
                break;
            case 0x61:
                this.h = this.c;
                break;
            case 0x62:
                this.h = this.d;
                break;
            case 0x63:
                this.h = this.e;
                break;
            case 0x64:
                this.h = this.h;
                break;
            case 0x65:
                this.h = this.l;
                break;
            case 0x66:
                this.h = this.onByteRead(this.hl);
                break;
            case 0x67:
                this.h = this.a;
                break;
            case 0x68:
                this.l = this.b;
                break;
            case 0x69:
                this.l = this.c;
                break;
            case 0x6A:
                this.l = this.d;
                break;
            case 0x6B:
                this.l = this.e;
                break;
            case 0x6C:
                this.l = this.h;
                break;
            case 0x6D:
                this.l = this.l;
                break;
            case 0x6E:
                this.l = this.onByteRead(this.hl);
                break;
            case 0x6F:
                this.l = this.a;
                break;
            case 0x70:
                this.writeByte(this.hl, this.b);
                break;
            case 0x71:
                this.writeByte(this.hl, this.c);
                break;
            case 0x72:
                this.writeByte(this.hl, this.d);
                break;
            case 0x73:
                this.writeByte(this.hl, this.e);
                break;
            case 0x74:
                this.writeByte(this.hl, this.h);
                break;
            case 0x75:
                this.writeByte(this.hl, this.l);
                break;
            case 0x76:
                this.halted = true;
                break;
            case 0x77:
                this.writeByte(this.hl, this.a);
                break;
            case 0x78:
                this.a = this.b;
                break;
            case 0x79:
                this.a = this.c;
                break;
            case 0x7A:
                this.a = this.d;
                break;
            case 0x7B:
                this.a = this.e;
                break;
            case 0x7C:
                this.a = this.h;
                break;
            case 0x7D:
                this.a = this.l;
                break;
            case 0x7E:
                this.a = this.onByteRead(this.hl);
                break;
            case 0x7F:
                this.a = this.a;
                break;
            case 0x80:
                this.a = this.addByte(this.a, this.b);
                break;
            case 0x81:
                this.a = this.addByte(this.a, this.c);
                break;
            case 0x82:
                this.a = this.addByte(this.a, this.d);
                break;
            case 0x83:
                this.a = this.addByte(this.a, this.e);
                break;
            case 0x84:
                this.a = this.addByte(this.a, this.h);
                break;
            case 0x85:
                this.a = this.addByte(this.a, this.l);
                break;
            case 0x86:
                this.a = this.addByte(this.a, this.onByteRead(this.hl));
                break;
            case 0x87:
                this.a = this.addByte(this.a, this.a);
                break;
            case 0x88:
                this.a = this.addByteWithCarry(this.a, this.b);
                break;
            case 0x89:
                this.a = this.addByteWithCarry(this.a, this.c);
                break;
            case 0x8A:
                this.a = this.addByteWithCarry(this.a, this.d);
                break;
            case 0x8B:
                this.a = this.addByteWithCarry(this.a, this.e);
                break;
            case 0x8C:
                this.a = this.addByteWithCarry(this.a, this.h);
                break;
            case 0x8D:
                this.a = this.addByteWithCarry(this.a, this.l);
                break;
            case 0x8E:
                this.a = this.addByteWithCarry(this.a, this.onByteRead(this.hl));
                break;
            case 0x8F:
                this.a = this.addByteWithCarry(this.a, this.a);
                break;
            case 0x90:
                this.a = this.subtractByte(this.a, this.b);
                break;
            case 0x91:
                this.a = this.subtractByte(this.a, this.c);
                break;
            case 0x92:
                this.a = this.subtractByte(this.a, this.d);
                break;
            case 0x93:
                this.a = this.subtractByte(this.a, this.e);
                break;
            case 0x94:
                this.a = this.subtractByte(this.a, this.h);
                break;
            case 0x95:
                this.a = this.subtractByte(this.a, this.l);
                break;
            case 0x96:
                this.a = this.subtractByte(this.a, this.onByteRead(this.hl));
                break;
            case 0x97:
                this.a = this.subtractByte(this.a, this.a);
                break;
            case 0x98:
                this.a = this.subtractByteWithCarry(this.a, this.b);
                break;
            case 0x99:
                this.a = this.subtractByteWithCarry(this.a, this.c);
                break;
            case 0x9A:
                this.a = this.subtractByteWithCarry(this.a, this.d);
                break;
            case 0x9B:
                this.a = this.subtractByteWithCarry(this.a, this.e);
                break;
            case 0x9C:
                this.a = this.subtractByteWithCarry(this.a, this.h);
                break;
            case 0x9D:
                this.a = this.subtractByteWithCarry(this.a, this.l);
                break;
            case 0x9E:
                this.a = this.subtractByteWithCarry(this.a, this.onByteRead(this.hl));
                break;
            case 0x9F:
                this.a = this.subtractByteWithCarry(this.a, this.a);
                break;
            case 0xA0:
                this.a = this.andByte(this.a, this.b);
                break;
            case 0xA1:
                this.a = this.andByte(this.a, this.c);
                break;
            case 0xA2:
                this.a = this.andByte(this.a, this.d);
                break;
            case 0xA3:
                this.a = this.andByte(this.a, this.e);
                break;
            case 0xA4:
                this.a = this.andByte(this.a, this.h);
                break;
            case 0xA5:
                this.a = this.andByte(this.a, this.l);
                break;
            case 0xA6:
                this.a = this.andByte(this.a, this.onByteRead(this.hl));
                break;
            case 0xA7:
                this.a = this.andByte(this.a, this.a);
                break;
            case 0xA8:
                this.a = this.xorByte(this.a, this.b);
                break;
            case 0xA9:
                this.a = this.xorByte(this.a, this.c);
                break;
            case 0xAA:
                this.a = this.xorByte(this.a, this.d);
                break;
            case 0xAB:
                this.a = this.xorByte(this.a, this.e);
                break;
            case 0xAC:
                this.a = this.xorByte(this.a, this.h);
                break;
            case 0xAD:
                this.a = this.xorByte(this.a, this.l);
                break;
            case 0xAE:
                this.a = this.xorByte(this.a, this.onByteRead(this.hl));
                break;
            case 0xAF:
                this.a = this.xorByte(this.a, this.a);
                break;
            case 0xB0:
                this.a = this.orByte(this.a, this.b);
                break;
            case 0xB1:
                this.a = this.orByte(this.a, this.c);
                break;
            case 0xB2:
                this.a = this.orByte(this.a, this.d);
                break;
            case 0xB3:
                this.a = this.orByte(this.a, this.e);
                break;
            case 0xB4:
                this.a = this.orByte(this.a, this.h);
                break;
            case 0xB5:
                this.a = this.orByte(this.a, this.l);
                break;
            case 0xB6:
                this.a = this.orByte(this.a, this.onByteRead(this.hl));
                break;
            case 0xB7:
                this.a = this.orByte(this.a, this.a);
                break;
            case 0xB8:
                this.subtractByte(this.a, this.b);
                break;
            case 0xB9:
                this.subtractByte(this.a, this.c);
                break;
            case 0xBA:
                this.subtractByte(this.a, this.d);
                break;
            case 0xBB:
                this.subtractByte(this.a, this.e);
                break;
            case 0xBC:
                this.subtractByte(this.a, this.h);
                break;
            case 0xBD:
                this.subtractByte(this.a, this.l);
                break;
            case 0xBE:
                this.subtractByte(this.a, this.onByteRead(this.hl));
                break;
            case 0xBF:
                this.subtractByte(this.a, this.a);
                break;
            case 0xC0:
                if (!(this.f & ZERO)) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xC1:
                this.bc = this.pop();
                break;
            case 0xC2:
                if (this.f & ZERO) {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                else {
                    this.pc = this.nextWord();
                }
                break;
            case 0xC3:
            case 0xCB:
                this.pc = this.getWord(this.pc);
                break;
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
            case 0xC5:
                this.push(this.bc);
                break;
            case 0xC6:
                this.a = this.addByte(this.a, this.nextByte());
                break;
            case 0xC7:
                this.push(this.pc);
                this.pc = 0;
                break;
            case 0xC8:
                if (this.f & ZERO) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xC9:
            case 0xD9:
                this.pc = this.pop();
                break;
            case 0xCA:
                if (this.f & ZERO) {
                    this.pc = this.nextWord();
                }
                else {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                break;
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
            case 0xCD:
            case 0xDD:
            case 0xED:
            case 0xFD:
                w = this.nextWord();
                this.push(this.pc);
                this.pc = w;
                break;
            case 0xCE:
                this.a = this.addByteWithCarry(this.a, this.nextByte());
                break;
            case 0xCF:
                this.push(this.pc);
                this.pc = 0x08;
                break;
            case 0xD0:
                if (!(this.f & CARRY)) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xD1:
                this.de = this.pop();
                break;
            case 0xD2:
                if (this.f & CARRY) {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                else {
                    this.pc = this.nextWord();
                }
                break;
            case 0xD3:
                this.writePort(this.nextByte(), this.a);
                break;
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
            case 0xD5:
                this.push(this.de);
                break;
            case 0xD6:
                this.a = this.subtractByte(this.a, this.nextByte());
                break;
            case 0xD7:
                this.push(this.pc);
                this.pc = 0x10;
                break;
            case 0xD8:
                if (this.f & CARRY) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xDA:
                if (this.f & CARRY) {
                    this.pc = this.nextWord();
                }
                else {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                break;
            case 0xDB:
                this.a = this.readPort(this.nextByte());
                break;
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
            case 0xDE:
                this.a = this.subtractByteWithCarry(this.a, this.nextByte());
                break;
            case 0xDF:
                this.push(this.pc);
                this.pc = 0x18;
                break;
            case 0xE0:
                if (!(this.f & PARITY)) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xE1:
                this.hl = this.pop();
                break;
            case 0xE2:
                if (this.f & PARITY) {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                else {
                    this.pc = this.nextWord();
                }
                break;
            case 0xE3:
                w = this.getWord(this.sp);
                this.writeWord(this.sp, this.hl);
                this.hl = w;
                break;
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
            case 0xE5:
                this.push(this.hl);
                break;
            case 0xE6:
                this.a = this.andByte(this.a, this.nextByte());
                break;
            case 0xE7:
                this.push(this.pc);
                this.pc = 0x20;
                break;
            case 0xE8:
                if (this.f & PARITY) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xE9:
                this.pc = this.hl;
                break;
            case 0xEA:
                if (this.f & PARITY) {
                    this.pc = this.nextWord();
                }
                else {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                break;
            case 0xEB:
                w = this.de;
                this.de = this.hl;
                this.hl = w;
                break;
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
            case 0xEE:
                this.a = this.xorByte(this.a, this.nextByte());
                break;
            case 0xEF:
                this.push(this.pc);
                this.pc = 0x28;
                break;
            case 0xF0:
                if (!(this.f & SIGN)) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xF1:
                this.af = this.pop();
                break;
            case 0xF2:
                if (this.f & SIGN) {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                else {
                    this.pc = this.nextWord();
                }
                break;
            case 0xF3:
                this.inte = false;
                break;
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
            case 0xF5:
                this.push(this.af);
                break;
            case 0xF6:
                this.a = this.orByte(this.a, this.nextByte());
                break;
            case 0xF7:
                this.push(this.pc);
                this.pc = 0x30;
                break;
            case 0xF8:
                if (this.f & SIGN) {
                    this.pc = this.pop();
                    jump = true;
                }
                break;
            case 0xF9:
                this.sp = this.hl;
                break;
            case 0xFA:
                if (this.f & SIGN) {
                    this.pc = this.nextWord();
                }
                else {
                    this.pc = (this.pc + 2) & 0xffff;
                }
                break;
            case 0xFB:
                this.inte = true;
                break;
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
            case 0xFE:
                this.subtractByte(this.a, this.nextByte());
                break;
            case 0xFF:
                this.push(this.pc);
                this.pc = 0x38;
                break;
        }
        this.f &= 0xd7;
        this.f |= 0x02;
        this.cycles += duration_1.default[i] + (jump ? 6 : 0);
    };
    Cpu8080.prototype.flagsToString = function () {
        var result = "", fx = "SZ0A0P1C";
        for (var i = 0; i < 8; i++) {
            if (this.f & (0x80 >> i)) {
                result += fx[i];
            }
            else {
                result += fx[i].toLowerCase();
            }
        }
        return result;
    };
    Cpu8080.prototype.toString = function () {
        return JSON.stringify({
            af: utils_1.toHex4(this.af),
            bc: utils_1.toHex4(this.bc),
            de: utils_1.toHex4(this.de),
            hl: utils_1.toHex4(this.hl),
            pc: utils_1.toHex4(this.pc),
            sp: utils_1.toHex4(this.sp),
            flags: this.flagsToString()
        }, null, "\t");
    };
    Cpu8080.prototype.status = function () {
        var result = {
            "pc": this.pc,
            "sp": this.sp,
            "a": this.a, "f": this.f,
            "b": this.b, "c": this.c,
            "d": this.d, "e": this.e,
            "h": this.h, "l": this.l
        };
        return result;
    };
    return Cpu8080;
}());
exports.default = Cpu8080;

},{"./tables/auxcarry":4,"./tables/daa":5,"./tables/duration":6,"./tables/flags":7,"./utils":10}],2:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mnemonics_1 = require("./tables/mnemonics");
var length_1 = require("./tables/length");
var utils_1 = require("./utils");
var CPUD8080;
(function (CPUD8080) {
    function disasm(instr, arg1, arg2) {
        var s = mnemonics_1.default[instr];
        var l = length_1.default[instr];
        if (arg1 != null && arg2 != null) {
            var d16 = utils_1.toHex2(arg2) + utils_1.toHex2(arg1);
            s = s.replace("*", "$" + d16);
        }
        else if (arg1 != null) {
            var d8 = utils_1.toHex2(arg1);
            s = s.replace("%", "$" + d8);
        }
        return [s, l];
    }
    CPUD8080.disasm = disasm;
})(CPUD8080 || (CPUD8080 = {}));
(window || global)["CPUD8080"] = CPUD8080;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./tables/length":8,"./tables/mnemonics":9,"./utils":10}],3:[function(require,module,exports){
(function (global){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var cpu8080_1 = require("./cpu8080");
var CPU8080;
(function (CPU8080) {
    var traceEnabled = false;
    var proc = null;
    function init(bt, ba, porto, porti) {
        proc = new cpu8080_1.default(bt, ba, porto, porti);
    }
    CPU8080.init = init;
    function steps(Ts) {
        while (Ts > 0) {
            Ts -= proc.step();
            if (traceEnabled) {
                this.tracer(proc);
            }
        }
    }
    CPU8080.steps = steps;
    CPU8080.T = (function () { return proc && proc.T; });
    CPU8080.set = (function (r, v) { return proc && proc.set(r, v); });
    CPU8080.reset = (function () { return proc && proc.reset(); });
    CPU8080.status = (function () { return proc && proc.status(); });
    CPU8080.flagsToString = (function () { return proc && proc.flagsToString(); });
    CPU8080.interrupt = (function (vector) { return proc && proc.interrupt(vector); });
    CPU8080.trace = (function (state) { return traceEnabled = state; });
    CPU8080.tracer = (function (processorInstance) { });
})(CPU8080 || (CPU8080 = {}));
(window || global)["CPU8080"] = CPU8080;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./cpu8080":1}],4:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var AC = 0x10;
exports.auxcarryTable = {
    "add": [0, AC, AC, AC, 0, 0, 0, AC],
    "sub": [AC, AC, 0, AC, 0, AC, 0, 0]
};

},{}],5:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var daaTable = [
    0x0046, 0x0102, 0x0202, 0x0306, 0x0402, 0x0506, 0x0606, 0x0702,
    0x0802, 0x0906, 0x1012, 0x1116, 0x1216, 0x1312, 0x1416, 0x1512,
    0x1002, 0x1106, 0x1206, 0x1302, 0x1406, 0x1502, 0x1602, 0x1706,
    0x1806, 0x1902, 0x2012, 0x2116, 0x2216, 0x2312, 0x2416, 0x2512,
    0x2002, 0x2106, 0x2206, 0x2302, 0x2406, 0x2502, 0x2602, 0x2706,
    0x2806, 0x2902, 0x3016, 0x3112, 0x3212, 0x3316, 0x3412, 0x3516,
    0x3006, 0x3102, 0x3202, 0x3306, 0x3402, 0x3506, 0x3606, 0x3702,
    0x3802, 0x3906, 0x4012, 0x4116, 0x4216, 0x4312, 0x4416, 0x4512,
    0x4002, 0x4106, 0x4206, 0x4302, 0x4406, 0x4502, 0x4602, 0x4706,
    0x4806, 0x4902, 0x5016, 0x5112, 0x5212, 0x5316, 0x5412, 0x5516,
    0x5006, 0x5102, 0x5202, 0x5306, 0x5402, 0x5506, 0x5606, 0x5702,
    0x5802, 0x5906, 0x6016, 0x6112, 0x6212, 0x6316, 0x6412, 0x6516,
    0x6006, 0x6102, 0x6202, 0x6306, 0x6402, 0x6506, 0x6606, 0x6702,
    0x6802, 0x6906, 0x7012, 0x7116, 0x7216, 0x7312, 0x7416, 0x7512,
    0x7002, 0x7106, 0x7206, 0x7302, 0x7406, 0x7502, 0x7602, 0x7706,
    0x7806, 0x7902, 0x8092, 0x8196, 0x8296, 0x8392, 0x8496, 0x8592,
    0x8082, 0x8186, 0x8286, 0x8382, 0x8486, 0x8582, 0x8682, 0x8786,
    0x8886, 0x8982, 0x9096, 0x9192, 0x9292, 0x9396, 0x9492, 0x9596,
    0x9086, 0x9182, 0x9282, 0x9386, 0x9482, 0x9586, 0x9686, 0x9782,
    0x9882, 0x9986, 0x0057, 0x0113, 0x0213, 0x0317, 0x0413, 0x0517,
    0x0047, 0x0103, 0x0203, 0x0307, 0x0403, 0x0507, 0x0607, 0x0703,
    0x0803, 0x0907, 0x1013, 0x1117, 0x1217, 0x1313, 0x1417, 0x1513,
    0x1003, 0x1107, 0x1207, 0x1303, 0x1407, 0x1503, 0x1603, 0x1707,
    0x1807, 0x1903, 0x2013, 0x2117, 0x2217, 0x2313, 0x2417, 0x2513,
    0x2003, 0x2107, 0x2207, 0x2303, 0x2407, 0x2503, 0x2603, 0x2707,
    0x2807, 0x2903, 0x3017, 0x3113, 0x3213, 0x3317, 0x3413, 0x3517,
    0x3007, 0x3103, 0x3203, 0x3307, 0x3403, 0x3507, 0x3607, 0x3703,
    0x3803, 0x3907, 0x4013, 0x4117, 0x4217, 0x4313, 0x4417, 0x4513,
    0x4003, 0x4107, 0x4207, 0x4303, 0x4407, 0x4503, 0x4603, 0x4707,
    0x4807, 0x4903, 0x5017, 0x5113, 0x5213, 0x5317, 0x5413, 0x5517,
    0x5007, 0x5103, 0x5203, 0x5307, 0x5403, 0x5507, 0x5607, 0x5703,
    0x5803, 0x5907, 0x0056, 0x0112, 0x0212, 0x0316, 0x0412, 0x0516,
    0x6007, 0x6103, 0x6203, 0x6307, 0x6403, 0x6507, 0x6607, 0x6703,
    0x6803, 0x6907, 0x7013, 0x7117, 0x7217, 0x7313, 0x7417, 0x7513,
    0x7003, 0x7107, 0x7207, 0x7303, 0x7407, 0x7503, 0x7603, 0x7707,
    0x7807, 0x7903, 0x8093, 0x8197, 0x8297, 0x8393, 0x8497, 0x8593,
    0x8083, 0x8187, 0x8287, 0x8383, 0x8487, 0x8583, 0x8683, 0x8787,
    0x8887, 0x8983, 0x9097, 0x9193, 0x9293, 0x9397, 0x9493, 0x9597,
    0x9087, 0x9183, 0x9283, 0x9387, 0x9483, 0x9587, 0x9687, 0x9783,
    0x9883, 0x9987, 0xA097, 0xA193, 0xA293, 0xA397, 0xA493, 0xA597,
    0xA087, 0xA183, 0xA283, 0xA387, 0xA483, 0xA587, 0xA687, 0xA783,
    0xA883, 0xA987, 0xB093, 0xB197, 0xB297, 0xB393, 0xB497, 0xB593,
    0xB083, 0xB187, 0xB287, 0xB383, 0xB487, 0xB583, 0xB683, 0xB787,
    0xB887, 0xB983, 0xC097, 0xC193, 0xC293, 0xC397, 0xC493, 0xC597,
    0xC087, 0xC183, 0xC283, 0xC387, 0xC483, 0xC587, 0xC687, 0xC783,
    0xC883, 0xC987, 0xD093, 0xD197, 0xD297, 0xD393, 0xD497, 0xD593,
    0xD083, 0xD187, 0xD287, 0xD383, 0xD487, 0xD583, 0xD683, 0xD787,
    0xD887, 0xD983, 0xE093, 0xE197, 0xE297, 0xE393, 0xE497, 0xE593,
    0xE083, 0xE187, 0xE287, 0xE383, 0xE487, 0xE583, 0xE683, 0xE787,
    0xE887, 0xE983, 0xF097, 0xF193, 0xF293, 0xF397, 0xF493, 0xF597,
    0xF087, 0xF183, 0xF283, 0xF387, 0xF483, 0xF587, 0xF687, 0xF783,
    0xF883, 0xF987, 0x0057, 0x0113, 0x0213, 0x0317, 0x0413, 0x0517,
    0x0047, 0x0103, 0x0203, 0x0307, 0x0403, 0x0507, 0x0607, 0x0703,
    0x0803, 0x0907, 0x1013, 0x1117, 0x1217, 0x1313, 0x1417, 0x1513,
    0x1003, 0x1107, 0x1207, 0x1303, 0x1407, 0x1503, 0x1603, 0x1707,
    0x1807, 0x1903, 0x2013, 0x2117, 0x2217, 0x2313, 0x2417, 0x2513,
    0x2003, 0x2107, 0x2207, 0x2303, 0x2407, 0x2503, 0x2603, 0x2707,
    0x2807, 0x2903, 0x3017, 0x3113, 0x3213, 0x3317, 0x3413, 0x3517,
    0x3007, 0x3103, 0x3203, 0x3307, 0x3403, 0x3507, 0x3607, 0x3703,
    0x3803, 0x3907, 0x4013, 0x4117, 0x4217, 0x4313, 0x4417, 0x4513,
    0x4003, 0x4107, 0x4207, 0x4303, 0x4407, 0x4503, 0x4603, 0x4707,
    0x4807, 0x4903, 0x5017, 0x5113, 0x5213, 0x5317, 0x5413, 0x5517,
    0x5007, 0x5103, 0x5203, 0x5307, 0x5403, 0x5507, 0x5607, 0x5703,
    0x5803, 0x5907, 0x6017, 0x6113, 0x6213, 0x6317, 0x6413, 0x6517,
    0x0606, 0x0702, 0x0802, 0x0906, 0x0A06, 0x0B02, 0x0C06, 0x0D02,
    0x0E02, 0x0F06, 0x1012, 0x1116, 0x1216, 0x1312, 0x1416, 0x1512,
    0x1602, 0x1706, 0x1806, 0x1902, 0x1A02, 0x1B06, 0x1C02, 0x1D06,
    0x1E06, 0x1F02, 0x2012, 0x2116, 0x2216, 0x2312, 0x2416, 0x2512,
    0x2602, 0x2706, 0x2806, 0x2902, 0x2A02, 0x2B06, 0x2C02, 0x2D06,
    0x2E06, 0x2F02, 0x3016, 0x3112, 0x3212, 0x3316, 0x3412, 0x3516,
    0x3606, 0x3702, 0x3802, 0x3906, 0x3A06, 0x3B02, 0x3C06, 0x3D02,
    0x3E02, 0x3F06, 0x4012, 0x4116, 0x4216, 0x4312, 0x4416, 0x4512,
    0x4602, 0x4706, 0x4806, 0x4902, 0x4A02, 0x4B06, 0x4C02, 0x4D06,
    0x4E06, 0x4F02, 0x5016, 0x5112, 0x5212, 0x5316, 0x5412, 0x5516,
    0x5606, 0x5702, 0x5802, 0x5906, 0x5A06, 0x5B02, 0x5C06, 0x5D02,
    0x5E02, 0x5F06, 0x6016, 0x6112, 0x6212, 0x6316, 0x6412, 0x6516,
    0x6606, 0x6702, 0x6802, 0x6906, 0x6A06, 0x6B02, 0x6C06, 0x6D02,
    0x6E02, 0x6F06, 0x7012, 0x7116, 0x7216, 0x7312, 0x7416, 0x7512,
    0x7602, 0x7706, 0x7806, 0x7902, 0x7A02, 0x7B06, 0x7C02, 0x7D06,
    0x7E06, 0x7F02, 0x8092, 0x8196, 0x8296, 0x8392, 0x8496, 0x8592,
    0x8682, 0x8786, 0x8886, 0x8982, 0x8A82, 0x8B86, 0x8C82, 0x8D86,
    0x8E86, 0x8F82, 0x9096, 0x9192, 0x9292, 0x9396, 0x9492, 0x9596,
    0x9686, 0x9782, 0x9882, 0x9986, 0x9A86, 0x9B82, 0x9C86, 0x9D82,
    0x9E82, 0x9F86, 0x0057, 0x0113, 0x0213, 0x0317, 0x0413, 0x0517,
    0x0607, 0x0703, 0x0803, 0x0907, 0x0A07, 0x0B03, 0x0C07, 0x0D03,
    0x0E03, 0x0F07, 0x1013, 0x1117, 0x1217, 0x1313, 0x1417, 0x1513,
    0x1603, 0x1707, 0x1807, 0x1903, 0x1A03, 0x1B07, 0x1C03, 0x1D07,
    0x1E07, 0x1F03, 0x2013, 0x2117, 0x2217, 0x2313, 0x2417, 0x2513,
    0x2603, 0x2707, 0x2807, 0x2903, 0x2A03, 0x2B07, 0x2C03, 0x2D07,
    0x2E07, 0x2F03, 0x3017, 0x3113, 0x3213, 0x3317, 0x3413, 0x3517,
    0x3607, 0x3703, 0x3803, 0x3907, 0x3A07, 0x3B03, 0x3C07, 0x3D03,
    0x3E03, 0x3F07, 0x4013, 0x4117, 0x4217, 0x4313, 0x4417, 0x4513,
    0x4603, 0x4707, 0x4807, 0x4903, 0x4A03, 0x4B07, 0x4C03, 0x4D07,
    0x4E07, 0x4F03, 0x5017, 0x5113, 0x5213, 0x5317, 0x5413, 0x5517,
    0x5607, 0x5703, 0x5803, 0x5907, 0x5A07, 0x5B03, 0x5C07, 0x5D03,
    0x5E03, 0x5F07, 0x0056, 0x0112, 0x0212, 0x0316, 0x0412, 0x0516,
    0x6607, 0x6703, 0x6803, 0x6907, 0x6A07, 0x6B03, 0x6C07, 0x6D03,
    0x6E03, 0x6F07, 0x7013, 0x7117, 0x7217, 0x7313, 0x7417, 0x7513,
    0x7603, 0x7707, 0x7807, 0x7903, 0x7A03, 0x7B07, 0x7C03, 0x7D07,
    0x7E07, 0x7F03, 0x8093, 0x8197, 0x8297, 0x8393, 0x8497, 0x8593,
    0x8683, 0x8787, 0x8887, 0x8983, 0x8A83, 0x8B87, 0x8C83, 0x8D87,
    0x8E87, 0x8F83, 0x9097, 0x9193, 0x9293, 0x9397, 0x9493, 0x9597,
    0x9687, 0x9783, 0x9883, 0x9987, 0x9A87, 0x9B83, 0x9C87, 0x9D83,
    0x9E83, 0x9F87, 0xA097, 0xA193, 0xA293, 0xA397, 0xA493, 0xA597,
    0xA687, 0xA783, 0xA883, 0xA987, 0xAA87, 0xAB83, 0xAC87, 0xAD83,
    0xAE83, 0xAF87, 0xB093, 0xB197, 0xB297, 0xB393, 0xB497, 0xB593,
    0xB683, 0xB787, 0xB887, 0xB983, 0xBA83, 0xBB87, 0xBC83, 0xBD87,
    0xBE87, 0xBF83, 0xC097, 0xC193, 0xC293, 0xC397, 0xC493, 0xC597,
    0xC687, 0xC783, 0xC883, 0xC987, 0xCA87, 0xCB83, 0xCC87, 0xCD83,
    0xCE83, 0xCF87, 0xD093, 0xD197, 0xD297, 0xD393, 0xD497, 0xD593,
    0xD683, 0xD787, 0xD887, 0xD983, 0xDA83, 0xDB87, 0xDC83, 0xDD87,
    0xDE87, 0xDF83, 0xE093, 0xE197, 0xE297, 0xE393, 0xE497, 0xE593,
    0xE683, 0xE787, 0xE887, 0xE983, 0xEA83, 0xEB87, 0xEC83, 0xED87,
    0xEE87, 0xEF83, 0xF097, 0xF193, 0xF293, 0xF397, 0xF493, 0xF597,
    0xF687, 0xF783, 0xF883, 0xF987, 0xFA87, 0xFB83, 0xFC87, 0xFD83,
    0xFE83, 0xFF87, 0x0057, 0x0113, 0x0213, 0x0317, 0x0413, 0x0517,
    0x0607, 0x0703, 0x0803, 0x0907, 0x0A07, 0x0B03, 0x0C07, 0x0D03,
    0x0E03, 0x0F07, 0x1013, 0x1117, 0x1217, 0x1313, 0x1417, 0x1513,
    0x1603, 0x1707, 0x1807, 0x1903, 0x1A03, 0x1B07, 0x1C03, 0x1D07,
    0x1E07, 0x1F03, 0x2013, 0x2117, 0x2217, 0x2313, 0x2417, 0x2513,
    0x2603, 0x2707, 0x2807, 0x2903, 0x2A03, 0x2B07, 0x2C03, 0x2D07,
    0x2E07, 0x2F03, 0x3017, 0x3113, 0x3213, 0x3317, 0x3413, 0x3517,
    0x3607, 0x3703, 0x3803, 0x3907, 0x3A07, 0x3B03, 0x3C07, 0x3D03,
    0x3E03, 0x3F07, 0x4013, 0x4117, 0x4217, 0x4313, 0x4417, 0x4513,
    0x4603, 0x4707, 0x4807, 0x4903, 0x4A03, 0x4B07, 0x4C03, 0x4D07,
    0x4E07, 0x4F03, 0x5017, 0x5113, 0x5213, 0x5317, 0x5413, 0x5517,
    0x5607, 0x5703, 0x5803, 0x5907, 0x5A07, 0x5B03, 0x5C07, 0x5D03,
    0x5E03, 0x5F07, 0x6017, 0x6113, 0x6213, 0x6317, 0x6413, 0x6517
];
exports.default = daaTable;

},{}],6:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var duration = [
    4, 10, 7, 5, 5, 5, 7, 4, 4, 10, 7, 5, 5, 5, 7, 4,
    4, 10, 7, 5, 5, 5, 7, 4, 4, 10, 7, 5, 5, 5, 7, 4,
    4, 10, 16, 5, 5, 5, 7, 4, 4, 10, 16, 5, 5, 5, 7, 4,
    4, 10, 13, 5, 10, 10, 10, 4, 4, 10, 13, 5, 5, 5, 7, 4,
    5, 5, 5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5, 7, 5,
    5, 5, 5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5, 7, 5,
    5, 5, 5, 5, 5, 5, 7, 5, 5, 5, 5, 5, 5, 5, 7, 5,
    7, 7, 7, 7, 7, 7, 7, 7, 5, 5, 5, 5, 5, 5, 7, 5,
    4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
    4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
    4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
    4, 4, 4, 4, 4, 4, 7, 4, 4, 4, 4, 4, 4, 4, 7, 4,
    5, 10, 10, 10, 11, 11, 7, 11, 5, 10, 10, 10, 11, 17, 7, 11,
    5, 10, 10, 10, 11, 11, 7, 11, 5, 10, 10, 10, 11, 17, 7, 11,
    5, 10, 10, 18, 11, 11, 7, 11, 5, 5, 10, 4, 11, 17, 7, 11,
    5, 10, 10, 4, 11, 11, 7, 11, 5, 5, 10, 4, 11, 17, 7, 11
];
exports.default = duration;

},{}],7:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var sz53p1Table = [
    0x46, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x02, 0x06, 0x06, 0x02, 0x06, 0x02, 0x02, 0x06,
    0x06, 0x02, 0x02, 0x06, 0x02, 0x06, 0x06, 0x02,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x86, 0x82, 0x82, 0x86, 0x82, 0x86, 0x86, 0x82,
    0x82, 0x86, 0x86, 0x82, 0x86, 0x82, 0x82, 0x86
];
exports.default = sz53p1Table;

},{}],8:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var length = [
    1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
    1, 3, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1,
    1, 3, 3, 1, 1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 2, 1,
    1, 3, 3, 1, 1, 1, 2, 1, 1, 1, 3, 1, 1, 1, 2, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
    1, 1, 3, 3, 3, 1, 2, 1, 1, 1, 3, 3, 3, 3, 2, 1,
    1, 1, 3, 2, 3, 1, 2, 1, 1, 1, 3, 2, 3, 3, 2, 1,
    1, 1, 3, 1, 3, 1, 2, 1, 1, 1, 3, 1, 3, 3, 2, 1,
    1, 1, 3, 1, 3, 1, 2, 1, 1, 1, 3, 1, 3, 3, 2, 1
];
exports.default = length;

},{}],9:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var mnemo8080 = [
    " NOP", " LXI  B,*", " STAX B", " INX  B", " INR  B", " DCR  B", " MVI  B,%", " RLC",
    "!NOP", " DAD  B", " LDAX B", " DCX  B", " INR  C", " DCR  C", " MVI  C,%", " RRC",
    "!NOP", " LXI  D,*", " STAX D", " INX  D", " INR  D", " DCR  D", " MVI  D,%", " RAL",
    "!NOP", " DAD  D", " LDAX D", " DCX  D", " INR  E", " DCR  E", " MVI  E,%", " RAR",
    "!NOP", " LXI  H,*", " SHLD *", " INX  H", " INR  H", " DCR  H", " MVI  H,%", " DAA",
    "!NOP", " DAD  H", " LHLD *", " DCX  H", " INR  L", " DCR  L", " MVI  L,%", " CMA",
    "!NOP", " LXI  SP,*", " STA  *", " INX  SP", " INR  M", " DCR  M", " MVI  M,%", " STC",
    "!NOP", " DAD  SP", " LDA  *", " DCX  SP", " INR  A", " DCR  A", " MVI  A,%", " CMC",
    " MOV  B,B", " MOV  B,C", " MOV  B,D", " MOV  B,E", " MOV  B,H", " MOV  B,L", " MOV  B,M", " MOV  B,A",
    " MOV  C,B", " MOV  C,C", " MOV  C,D", " MOV  C,E", " MOV  C,H", " MOV  C,L", " MOV  C,M", " MOV  C,A",
    " MOV  D,B", " MOV  D,C", " MOV  D,D", " MOV  D,E", " MOV  D,H", " MOV  D,L", " MOV  D,M", " MOV  D,A",
    " MOV  E,B", " MOV  E,C", " MOV  E,D", " MOV  E,E", " MOV  E,H", " MOV  E,L", " MOV  E,M", " MOV  E,A",
    " MOV  H,B", " MOV  H,C", " MOV  H,D", " MOV  H,E", " MOV  H,H", " MOV  H,L", " MOV  H,M", " MOV  H,A",
    " MOV  L,B", " MOV  L,C", " MOV  L,D", " MOV  L,E", " MOV  L,H", " MOV  L,L", " MOV  L,M", " MOV  L,A",
    " MOV  M,B", " MOV  M,C", " MOV  M,D", " MOV  M,E", " MOV  M,H", " MOV  M,L", " HLT", " MOV  M,A",
    " MOV  A,B", " MOV  A,C", " MOV  A,D", " MOV  A,E", " MOV  A,H", " MOV  A,L", " MOV  A,M", " MOV  A,A",
    " ADD  B", " ADD  C", " ADD  D", " ADD  E", " ADD  H", " ADD  L", " ADD  M", " ADD  A",
    " ADC  B", " ADC  C", " ADC  D", " ADC  E", " ADC  H", " ADC  L", " ADC  M", " ADC  A",
    " SUB  B", " SUB  C", " SUB  D", " SUB  E", " SUB  H", " SUB  L", " SUB  M", " SUB  A",
    " SBB  B", " SBB  C", " SBB  D", " SBB  E", " SBB  H", " SBB  L", " SBB  M", " SBB  A",
    " ANA  B", " ANA  C", " ANA  D", " ANA  E", " ANA  H", " ANA  L", " ANA  M", " ANA  A",
    " XRA  B", " XRA  C", " XRA  D", " XRA  E", " XRA  H", " XRA  L", " XRA  M", " XRA  A",
    " ORA  B", " ORA  C", " ORA  D", " ORA  E", " ORA  H", " ORA  L", " ORA  M", " ORA  A",
    " CMP  B", " CMP  C", " CMP  D", " CMP  E", " CMP  H", " CMP  L", " CMP  M", " CMP  A",
    " RNZ", " POP  B", " JNZ  *", " JMP  *", " CNZ  *", " PUSH B", " ADI  %", " RST  0",
    " RZ", " RET", " JZ   *", "!JMP  *", " CZ   *", " CALL *", " ACI  %", " RST  1",
    " RNC", " POP  D", " JNC  *", " OUT  %", " CNC  *", " PUSH D", " SUI  %", " RST  2",
    " RC", "!RET", " JC   *", " IN   %", " CC   *", "!CALL *", " SBI  %", " RST  3",
    " RPO", " POP  H", " JPO  *", " XTHL", " CPO  *", " PUSH H", " ANI  %", " RST  4",
    " RPE", " PCHL", " JPE  *", " XCHG", " CPE  *", "!CALL *", " XRI  %", " RST  5",
    " RP", " POP  PSW", " JP   *", " DI", " CP   *", " PUSH PSW", " ORI  %", " RST  6",
    " RM", " SPHL", " JM   *", " EI", " CM   *", "!CALL *", " CPI  %", " RST  7"
];
exports.default = mnemo8080;

},{}],10:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function toHexN(n, width) {
    if (width === void 0) { width = 0; }
    var str = n.toString(16).toUpperCase();
    return ('00000000' + str).substr(-Math.max(width, str.length));
}
;
function toHex2(n) { return toHexN(n & 0xff, 2); }
exports.toHex2 = toHex2;
;
function toHex4(n) { return toHexN(n & 0xffff, 4); }
exports.toHex4 = toHex4;
;

},{}]},{},[3,2]);
