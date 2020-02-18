pragma solidity >=0.6.1;

import "./base/IERC20.sol";
import "./base/SafeMath.sol";

/**
 * Represents Wrapped ETH, see https://blog.0xproject.com/canonical-weth-a9aa7d0279dd
 */
contract EtherToken is IERC20 {
  using SafeMath for *;

  mapping (address => uint256) private balances;
  mapping (address => mapping (address => uint256)) private allowances;
  uint8 public constant override decimals = 18;
  uint256 public override totalSupply;

  function name() external view override returns (string memory) {
    return "EthGoals Wrapped Ether";
  }

  function symbol() external view override returns (string memory) {
    return "ETHGOALS_ETH";
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
      _approve(sender, msg.sender, allowances[sender][msg.sender].sub(amount, "EtherToken: transfer amount exceeds allowance"));
      _transfer(sender, recipient, amount);
      return true;
  }

  function _transfer(address sender, address recipient, uint256 amount) internal {
      require(recipient != address(0), "EtherToken: transfer to the zero address");

      balances[sender] = balances[sender].sub(amount, "EtherToken: transfer amount exceeds balance");
      balances[recipient] = balances[recipient].add(amount);
      emit Transfer(sender, recipient, amount);
  }

  function _approve(address owner, address spender, uint256 amount) internal {
      require(spender != address(0), "EtherToken: approve to the zero address");

      allowances[owner][spender] = amount;
      emit Approval(owner, spender, amount);
  }

  function deposit() public payable {
      balances[msg.sender] = balances[msg.sender].add(msg.value);
      totalSupply = totalSupply.add(msg.value);
  }

  function withdraw(uint value) public {
      // Balance covers value
      balances[msg.sender] = balances[msg.sender].sub(value, 'EtherToken: insufficient balance');
      totalSupply = totalSupply.sub(value);
      msg.sender.transfer(value);
  }
}