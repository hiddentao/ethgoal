pragma solidity >=0.6.1;

abstract contract AbstractControllerBase {
    address public bank;
    bool public locked;
    uint public fee;
    uint public judgementPeriod;

    struct Judgement {
        address judge;
        uint pledgeId;
        bool passed;
    }
    mapping (uint => Judgement) public judgements;
    uint public numJudgements;

    struct Pledge {
        address creator;
        mapping (uint => address) judges;
        mapping (address => bool) isJudge;
        uint numJudges;
        mapping (address => uint) judgements;
        uint numJudgements;
        uint numFailedJudgements;
        uint pot;
        uint balance;
        address unit;
        uint endDate;
    }
    mapping (uint => Pledge) public pledges;
    uint public numPledges;

    struct User {
        mapping (address => uint) balances;
        mapping (uint => uint) pledgesCreated;
        uint numPledgesCreated;
        uint oldestActiveCreatedPledgeIndex;
        mapping (uint => uint) pledgesJudged;
        uint numPledgesJudged;
        uint oldestActiveJudgedPledgeIndex;
    }
    mapping (address => User) public users;

    event NewPledge(uint indexed pledgeId);
    event NewJudgement(uint indexed judgementId);
    event Withdraw(address indexed caller);
    event Locked(address indexed caller);
    event Unlocked(address indexed caller);
}