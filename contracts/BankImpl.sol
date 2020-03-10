pragma solidity >=0.6.1;

import "./EternalStorage.sol";
import "./IBank.sol";
import "./Ownable.sol";
import "./SafeMath.sol";
import "./IChai.sol";
import "./IERC20.sol";
import "./SettingsControl.sol";

contract BankImpl is IBank, SettingsControl, Ownable {
  using SafeMath for *;

  constructor (address _settings) SettingsControl(_settings) Ownable() public {}

  function deposit(address _from, uint _amount) public override {
    // user -> bank
    settings().getPaymentUnit().transferFrom(_from, address(this), _amount);
    // bank -> chai
    settings().getChai().join(address(this), _amount);
    // update total
    dataUint256["userDepositTotal"] = dataUint256["userDepositTotal"].add(_amount);
  }

  function withdraw(address _to, uint _amount) public override {
    // chai -> bank
    settings().getChai().draw(address(this), _amount);
    // bank -> user
    settings().getPaymentUnit().transfer(_to, _amount);
    // update total
    dataUint256["userDepositTotal"] = dataUint256["userDepositTotal"].sub(_amount);
  }

  function getUserDepositTotal() public override view returns (uint) {
    return dataUint256["userDepositTotal"];
  }

  function getInterest() public override returns (uint) {
    return settings().getChai().dai(address(this)) - getUserDepositTotal();
  }

  function withdrawInterest() public override onlyOwner {
    uint amount = getInterest();
    // chai -> bank
    settings().getChai().draw(address(this), amount);
    // bank -> sender
    settings().getPaymentUnit().transfer(msg.sender, amount);
  }
}