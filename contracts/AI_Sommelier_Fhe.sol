pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AISommelierFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    mapping(uint256 => bool) public isBatchClosed;

    struct EncryptedWineNote {
        euint32 wineType;       // Encrypted: e.g., 0: Red, 1: White, 2: Rose, 3: Sparkling
        euint32 rating;         // Encrypted: 1-5 scale
        euint32 foodPairingId;  // Encrypted: ID for food pairing
        euint32 userId;         // Encrypted: User identifier
    }
    mapping(uint256 => EncryptedWineNote[]) public batchNotes; // batchId => notes

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event ContractPaused(address indexed account);
    event ContractUnpaused(address indexed account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 batchId);
    event BatchClosed(uint256 batchId);
    event WineNoteSubmitted(address indexed provider, uint256 batchId, uint256 noteIndex);
    event RecommendationRequested(uint256 indexed requestId, uint256 batchId);
    event RecommendationCompleted(uint256 indexed requestId, uint256 batchId, uint256[] recommendationResults);

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchClosedOrInvalid();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidBatchId();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        emit ProviderAdded(owner);
        cooldownSeconds = 60; // Default cooldown
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        if (!paused) revert Paused(); // Already unpaused
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyOwner whenNotPaused {
        currentBatchId++;
        isBatchClosed[currentBatchId] = false;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch(uint256 batchId) external onlyOwner whenNotPaused {
        if (batchId == 0 || batchId > currentBatchId || isBatchClosed[batchId]) revert InvalidBatchId();
        isBatchClosed[batchId] = true;
        emit BatchClosed(batchId);
    }

    function submitEncryptedWineNote(
        euint32 _wineType,
        euint32 _rating,
        euint32 _foodPairingId,
        euint32 _userId
    ) external onlyProvider whenNotPaused {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        if (currentBatchId == 0 || isBatchClosed[currentBatchId]) {
            revert BatchClosedOrInvalid();
        }

        _initIfNeeded(_wineType);
        _initIfNeeded(_rating);
        _initIfNeeded(_foodPairingId);
        _initIfNeeded(_userId);

        batchNotes[currentBatchId].push(EncryptedWineNote(_wineType, _rating, _foodPairingId, _userId));
        lastSubmissionTime[msg.sender] = block.timestamp;

        emit WineNoteSubmitted(msg.sender, currentBatchId, batchNotes[currentBatchId].length - 1);
    }

    function requestRecommendation(uint256 batchId) external onlyProvider whenNotPaused {
        if (batchId == 0 || batchId > currentBatchId || !isBatchClosed[batchId]) {
            revert InvalidBatchId();
        }
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }

        EncryptedWineNote[] storage notes = batchNotes[batchId];
        if (notes.length == 0) revert("No notes in batch");

        euint32[] memory _wineTypes = new euint32[](notes.length);
        euint32[] memory _ratings = new euint32[](notes.length);
        euint32[] memory _foodPairingIds = new euint32[](notes.length);
        euint32[] memory _userIds = new euint32[](notes.length);

        for (uint256 i = 0; i < notes.length; i++) {
            _wineTypes[i] = notes[i].wineType;
            _ratings[i] = notes[i].rating;
            _foodPairingIds[i] = notes[i].foodPairingId;
            _userIds[i] = notes[i].userId;
        }

        // Placeholder FHE logic: Sum ratings for each wine type (example)
        // In a real scenario, this would be a more complex AI model
        euint32[] memory recommendationScores = new euint32[](4); // 4 wine types
        for (uint256 i = 0; i < 4; i++) {
            recommendationScores[i] = FHE.asEuint32(0);
        }

        for (uint256 i = 0; i < notes.length; i++) {
            ebool isType0 = _wineTypes[i].eq(FHE.asEuint32(0));
            ebool isType1 = _wineTypes[i].eq(FHE.asEuint32(1));
            ebool isType2 = _wineTypes[i].eq(FHE.asEuint32(2));
            ebool isType3 = _wineTypes[i].eq(FHE.asEuint32(3));

            euint32 rating = _ratings[i];
            recommendationScores[0] = recommendationScores[0].add(rating.mul(isType0.toEuint32()));
            recommendationScores[1] = recommendationScores[1].add(rating.mul(isType1.toEuint32()));
            recommendationScores[2] = recommendationScores[2].add(rating.mul(isType2.toEuint32()));
            recommendationScores[3] = recommendationScores[3].add(rating.mul(isType3.toEuint32()));
        }

        bytes32[] memory cts = new bytes32[](4);
        for (uint256 i = 0; i < 4; i++) {
            cts[i] = recommendationScores[i].toBytes32();
        }
        bytes32 stateHash = _hashCiphertexts(cts);

        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);
        decryptionContexts[requestId] = DecryptionContext(batchId, stateHash, false);
        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        emit RecommendationRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();

        DecryptionContext memory ctx = decryptionContexts[requestId];
        // Security: Rebuild cts from current contract storage to ensure state consistency
        EncryptedWineNote[] storage notes = batchNotes[ctx.batchId];
        euint32[] memory _wineTypes = new euint32[](notes.length);
        euint32[] memory _ratings = new euint32[](notes.length);
        euint32[] memory _foodPairingIds = new euint32[](notes.length);
        euint32[] memory _userIds = new euint32[](notes.length);

        for (uint256 i = 0; i < notes.length; i++) {
            _wineTypes[i] = notes[i].wineType;
            _ratings[i] = notes[i].rating;
            _foodPairingIds[i] = notes[i].foodPairingId;
            _userIds[i] = notes[i].userId;
        }
        euint32[] memory recommendationScores = new euint32[](4);
        for (uint256 i = 0; i < 4; i++) {
            recommendationScores[i] = FHE.asEuint32(0);
        }
        for (uint256 i = 0; i < notes.length; i++) {
            ebool isType0 = _wineTypes[i].eq(FHE.asEuint32(0));
            ebool isType1 = _wineTypes[i].eq(FHE.asEuint32(1));
            ebool isType2 = _wineTypes[i].eq(FHE.asEuint32(2));
            ebool isType3 = _wineTypes[i].eq(FHE.asEuint32(3));
            euint32 rating = _ratings[i];
            recommendationScores[0] = recommendationScores[0].add(rating.mul(isType0.toEuint32()));
            recommendationScores[1] = recommendationScores[1].add(rating.mul(isType1.toEuint32()));
            recommendationScores[2] = recommendationScores[2].add(rating.mul(isType2.toEuint32()));
            recommendationScores[3] = recommendationScores[3].add(rating.mul(isType3.toEuint32()));
        }
        bytes32[] memory currentCts = new bytes32[](4);
        for (uint256 i = 0; i < 4; i++) {
            currentCts[i] = recommendationScores[i].toBytes32();
        }
        bytes32 currentStateHash = _hashCiphertexts(currentCts);

        if (currentStateHash != ctx.stateHash) revert StateMismatch();
        FHE.checkSignatures(requestId, cleartexts, proof);

        uint256[] memory results = new uint256[](4);
        for (uint256 i = 0; i < 4; i++) {
            results[i] = abi.decode(cleartexts, (uint256));
            cleartexts = cleartexts[32:]; // Advance slice
        }

        decryptionContexts[requestId].processed = true;
        emit RecommendationCompleted(requestId, ctx.batchId, results);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal view returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 v) internal {
        if (!v.isInitialized()) {
            v.initialize(FHE.asEuint32(0));
        }
    }

    function _requireInitialized(euint32 v) internal pure {
        if (!v.isInitialized()) revert("Ciphertext not initialized");
    }
}