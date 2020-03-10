pragma solidity >=0.6.1;

interface IBank {
  function deposit(address _from, uint _amount) external;
  function withdraw(address _to, uint _amount) external;
  function getUserDepositTotal() external view returns (uint);
  function emitProfit() external;
  function withdrawProfit() external;

  event Profit(uint indexed amount);
}
