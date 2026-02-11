import * as lp from "it-length-prefixed";
import { encode, decode } from "it-length-prefixed";

console.log("--- it-length-prefixed Diagnostic ---");
console.log("Type of default export:", typeof lp);
console.log("Keys of default export:", Object.keys(lp));
console.log("Type of named encode:", typeof encode);
console.log("Type of named decode:", typeof decode);

if (typeof encode === "function") {
  try {
    const result = encode();
    console.log("Result of encode():", typeof result);
    if (typeof result === "function") {
      console.log("encode() returns a function (It IS a factory)");
    } else {
      console.log("encode() returns:", result);
      console.log("It is NOT a factory.");
    }
  } catch (e) {
    console.log("Calling encode() threw error:", e.message);
  }
}

console.log("--- End Diagnostic ---");
