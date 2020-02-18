pragma solidity >=0.6.1;

interface IBank {
  function setController(address _controller) external;
  function deposit(address _unit, address _from, uint _amount) external payable;
  function withdraw(address _unit, address _to, uint _amount) external;
}
