// BigInt-safe JSON serialization
// Standard JSON.stringify throws TypeError for BigInt
// This utility converts BigInt to string during serialization
// and DOES NOT automatically revert to BigInt during parsing (to avoid ambiguity)
// Manual conversion to BigInt is preferred in the domain layer.

export const stringify = (value, replacer = null, space = 0) => {
  return JSON.stringify(
    value,
    (key, val) => {
      // Use custom replacer if provided
      if (replacer) {
        val = replacer(key, val);
      }
      // Handle BigInt
      if (typeof val === "bigint") {
        return val.toString();
      }
      return val;
    },
    space,
  );
};

export const parse = (text, reviver = null) => {
  return JSON.parse(text, reviver);
};
