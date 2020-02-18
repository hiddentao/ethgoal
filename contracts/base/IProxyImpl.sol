pragma solidity >=0.6.1;

interface IProxyImpl {
  function getImplementationVersion() external pure returns (string memory);
}