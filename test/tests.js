module("Basic tests");

test("Namespace", function () {
	notEqual(CPU8080, null, "CPU8080 is defined");
	equal(typeof CPU8080, "object", "CPU8080 is an object");
});

test("Init", function () {
	CPU8080.init();
	equal(typeof (CPU8080.status().pc), "number", "CPU8080 INIT OK");
});

module("Simple data tests", {
	setup: function () {
		CPU8080.init();
	}
});

test("Reset", function () {
	CPU8080.set("PC", 0x55);
	CPU8080.reset();
	equal(CPU8080.status().pc, 0, "Reset PC OK");
	equal(CPU8080.T(), 0, "Reset T counter OK");
});

test("Register manipulations", function () {
	CPU8080.set("A", 0x55);
	CPU8080.set("B", 0xAA);
	CPU8080.set("SP", 0x1234);
	CPU8080.set("PC", 0xFFFF);
	equal(CPU8080.status().a, 0x55);
	equal(CPU8080.status().b, 0xaa);
	equal(CPU8080.status().sp, 0x1234);
	equal(CPU8080.status().pc, 0xffff);
});

module("Single step", {
	setup: function () {
		CPU8080.init(null, function (addr) { return 0 });
		CPU8080.reset();
	}
});

test("NOP, just NOPs", function () {
	CPU8080.steps(1);
	equal(CPU8080.status().pc, 0x0001, "NOP OK");
	equal(CPU8080.T(), 4, "Timing OK");
});

test("RST7", function () {
	CPU8080.init(
		function () {},
		function (addr) { return 0xff }
	);
	CPU8080.steps(1);
	equal(CPU8080.status().pc, 0x0038, "RST7 OK");
	equal(CPU8080.T(), 11, "Timing OK");
});

test("LXI D,$1111", function () {
	CPU8080.init(
		function () {},
		function (addr) { return 0x11 }
	);
	CPU8080.steps(1);
	equal(CPU8080.status().pc, 0x0003, "LXI D OK");
	equal(CPU8080.status().d, 0x11, "D value OK");
	equal(CPU8080.status().e, 0x11, "D value OK");
	equal(CPU8080.T(), 10, "Timing OK");
});

module("Disassembler");

test("NOP, just NOPs", function () {
	var d = CPUD8080.disasm(0);
	equal(d[0], " NOP", "Instruction decoded OK");
	equal(d[1], 1, "Instruction length OK");
});

test("XRA A", function () {
	var d = CPUD8080.disasm(0xaf);
	equal(d[0], " XRA  A", "Instruction decoded OK");
	equal(d[1], 1, "Instruction length OK");
});

test("LXI H,$1234", function () {
	var d = CPUD8080.disasm(0x21, 0x34, 0x12);
	equal(d[0], " LXI  H,$1234", "Instruction decoded OK");
	equal(d[1], 3, "Instruction length OK");
});

test("undocumented RET", function () {
	var d = CPUD8080.disasm(0xd9);
	equal(d[0], "!RET", "Instruction decoded OK");
	equal(d[1], 1, "Instruction length OK");
});
