import { cryptoHash } from "./index.js";

class MerkleTree {
  constructor(data) {
    this.leaves = data.map((item) => cryptoHash(item));
    this.root = this.constructTree(this.leaves);
  }

  constructTree(leaves) {
    if (leaves.length === 0) return null;
    if (leaves.length === 1) return leaves[0];

    const nextLevel = [];
    for (let i = 0; i < leaves.length; i += 2) {
      if (i + 1 < leaves.length) {
        nextLevel.push(cryptoHash(leaves[i], leaves[i + 1]));
      } else {
        nextLevel.push(leaves[i]);
      }
    }
    return this.constructTree(nextLevel);
  }

  getRoot() {
    return this.root;
  }
}

export default MerkleTree;
