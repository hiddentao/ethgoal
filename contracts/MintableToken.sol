pragma solidity >=0.6.1;

import "./SafeMath.sol";
import "./IERC20.sol";
import "./IMintableToken.sol";

/**
 * A simple ERC20 token with minting ability.
 *
 * This is modified
 */
contract MintableToken is IERC20, IMintableToken {
  using SafeMath for *;

  mapping (address => uint256) private balances;
  mapping (address => mapping (address => uint256)) private allowances;
  uint8 public constant override decimals = 18;
  uint256 public override totalSupply;

  constructor () public {}

  function name() external view override returns (string memory) {
    return "EthGoals Token";
  }

  function symbol() external view override returns (string memory) {
    return "ETHGOAL";
  }

  function balanceOf(address account) public view override returns (uint256) {
      return balances[account];
  }

  function transfer(address recipient, uint256 amount) public override returns (bool) {
      _transfer(msg.sender, recipient, amount);
      return true;
  }

  function allowance(address owner, address spender) public view override returns (uint256) {
      return allowances[owner][spender];
  }

  function approve(address spender, uint256 amount) public override returns (bool) {
      _approve(msg.sender, spender, amount);
      return true;
  }

  function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
      _approve(sender, msg.sender, allowances[sender][msg.sender].sub(amount, "transfer amount exceeds allowance"));
      _transfer(sender, recipient, amount);
      return true;
  }

  function _transfer(address sender, address recipient, uint256 amount) internal {
      require(recipient != address(0), "transfer to the zero address");

      balances[sender] = balances[sender].sub(amount, "transfer amount exceeds balance");
      balances[recipient] = balances[recipient].add(amount);
      emit Transfer(sender, recipient, amount);
  }

  function _approve(address owner, address spender, uint256 amount) internal {
      require(spender != address(0), "approve to the zero address");

      allowances[owner][spender] = amount;
      emit Approval(owner, spender, amount);
  }

  function mint(uint256 _amount) public override {
      balances[msg.sender] += _amount;
      totalSupply += _amount;
  }
}