function toHexN(n: number, width: number = 0) {
	const str = n.toString(16).toUpperCase();
	return ('00000000' + str).substr(-Math.max(width, str.length));
};

export function toHex2(n: number) { return toHexN(n & 0xff, 2); };
export function toHex4(n: number) { return toHexN(n & 0xffff, 4); };
