pragma solidity >=0.6.1;

import "./EternalStorage.sol";
import "./IBank.sol";
import "./Ownable.sol";
import "./SafeMath.sol";
import "./IChai.sol";
import "./IERC20.sol";
import "./SettingsControl.sol";
import "./IProxyImpl.sol";

contract BankImpl is IBank, SettingsControl, Ownable, IProxyImpl {
  using SafeMath for *;

  modifier isController () {
    require(msg.sender == settings().getController(), 'must be controller');
    _;
  }

  constructor (address _settings) SettingsControl(_settings) Ownable() public {}

  function getImplementationVersion() public override pure returns (string memory) {
    return "v1";
  }

  function deposit(address _from, uint _amount) public override isController {
    IERC20 token = settings().getPaymentUnit();
    // user -> bank
    token.transferFrom(_from, address(this), _amount);
    // bank -> chai
    IChai chai = settings().getChai();
    token.approve(address(chai), _amount);
    chai.join(address(this), _amount);
    // update total
    dataUint256["userDepositTotal"] = dataUint256["userDepositTotal"].add(_amount);
  }

  function withdraw(address _to, uint _amount) public override isController {
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

  function emitProfit() public override {
    uint amount = _getProfit();
    emit Profit(amount);
  }

  function withdrawProfit() public override onlyOwner {
    uint amount = _getProfit();
    // chai -> bank
    settings().getChai().draw(address(this), amount);
    // bank -> sender
    settings().getPaymentUnit().transfer(msg.sender, amount);
  }

  function _getProfit() private returns (uint) {
    return settings().getChai().dai(address(this)) - getUserDepositTotal();
  }
}

