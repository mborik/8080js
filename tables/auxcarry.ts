// Auxiliary Carry (AC) result table after ADD and SUB instructions.
// AC flag can be detected from bit3 of both arguments and result.
// This table is in r21 form, where 'r' is bit3 of result, '2' is bit3
// of second argument and '1' is bit3 of first argument (A register).
const AC: number = 0x10;
export const auxcarryTable = {
	'add': [0, AC, AC, AC, 0, 0, 0, AC],
	'sub': [AC, AC, 0, AC, 0, AC, 0, 0]
};
