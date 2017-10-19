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
import Cpu8080 from "./cpu8080";

namespace CPU8080 {
	let traceEnabled: boolean = false;
	let proc: Cpu8080 = null;

	export function init(bt, ba, porto, porti) {
		proc = new Cpu8080(bt, ba, porto, porti);
	}

	export function steps(Ts: number) {
		while (Ts > 0) {
			Ts -= proc.step();

			if (traceEnabled) {
				this.tracer(proc);
			}
		}
	}

	export const T = (() => proc && proc.T);
	export const set = ((r, v) => proc && proc.set(r, v));
	export const reset = (() => proc && proc.reset());
	export const status = (() => proc && proc.status());
	export const flagsToString = (() => proc && proc.flagsToString());
	export const interrupt = ((vector) => proc && proc.interrupt(vector));

	export const trace = ((state) => traceEnabled = state);
	export const tracer = ((processorInstance: Cpu8080) => {});
}

declare var global: any;
(window || global)["CPU8080"] = CPU8080;
