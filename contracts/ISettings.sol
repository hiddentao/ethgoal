pragma solidity >=0.6.1;

import "./IBank.sol";
import "./IController.sol";
import "./IChai.sol";
import "./IERC20.sol";

interface ISettings {
  function setController(address _contract) external;
  function getController() external view returns (address);

  function setBank(address _contract) external;
  function getBank() external view returns (IBank);

  function setChai(address _contract) external;
  function getChai() external view returns (IChai);

  function setPaymentUnit(address _contract) external;
  function getPaymentUnit() external view returns (IERC20);

  function getTime() external view returns (uint);
}