pragma solidity >=0.6.1;

interface IController {
  function createPledge(
    uint _potAmount,
    uint _endDate,
    uint _numJudges,
    bytes calldata _judgeSig0,
    bytes calldata _judgeSig1,
    bytes calldata _judgeSig2
  ) external returns (uint);

  function judgePledge(uint _pledgeId, bool _result) external;

  function getPledge(uint _index) external view returns (
    address creator,
    uint numJudges_,
    uint numJudgements_,
    uint numFailedJudgements_,
    uint pot_,
    uint balance_,
    uint endDate_,
    bool failed_,
    bool withdrawable_,
    bool judgeable_
  );
  function getPledgeJudge(uint _pledgeId, uint _judgeIndex) external view returns (address);
  function getPledgeJudgement(uint _pledgeId, address _judge) external view returns (uint);

  function getJudgement(uint _index) external view returns (
    address judge_,
    uint pledgeId_,
    bool passed_
  );

  function getUser(address _user) external view returns (
    uint balance_,
    uint numPledgesCreated_,
    uint oldestActiveCreatedPledgeIndex_,
    uint numPledgesJudged_,
    uint oldestActiveJudgedPledgeIndex_
  );

  function withdraw () external;
  function lock () external;
  function unlock () external;
  function isLocked() external view returns (bool);

  function getNumPledges() external view returns (uint);
  function getNumJudgements() external view returns (uint);

  function isPledgeJudgeable (uint _pledgeId) external view returns (bool);
  function isPledgeWithdrawable (uint _pledgeId) external view returns (bool);
  function isPledgeFailed (uint _pledgeId) external view returns (bool);

  function calculatePledgeFingerprint(
    address _creator,
    uint _potAmount,
    uint _endDate,
    uint _numJudges
  ) external pure returns (bytes32);
}