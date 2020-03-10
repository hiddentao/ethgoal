pragma solidity >=0.6.1;

/**
 * Interface to Chai.Money
 * See https://github.com/dapphub/chai/blob/master/src/chai.sol
 */
interface IChai {
  // deposit DAI
  function join(address dst, uint wad) external;
  // withdraw DAI
  function draw(address src, uint wad) external;
  // get total DAI
  function dai(address usr) external returns (uint wad);
}
