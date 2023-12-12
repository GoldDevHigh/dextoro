// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import {console} from "forge-std/Test.sol";
import {TestHelpers} from "../../utils/helpers/TestHelpers.t.sol";
import {DexToro} from "../../../../contracts/DexToro.sol";
import {RewardEscrow} from "../../../../contracts/RewardEscrow.sol";
import {SupplySchedule} from "../../../../contracts/SupplySchedule.sol";
import {StakingRewards} from "../../../../contracts/StakingRewards.sol";
import {MultipleMerkleDistributor} from "../../../../contracts/MultipleMerkleDistributor.sol";
import "../../utils/Constants.t.sol";

contract StakingV1Setup is TestHelpers {
    /*//////////////////////////////////////////////////////////////
                                State
    //////////////////////////////////////////////////////////////*/

    address internal treasury;
    address internal owner;
    address internal user1;
    address internal user2;
    address internal user3;
    address internal user4;
    address internal user5;

    DexToro internal dextoro;
    RewardEscrow internal rewardEscrowV1;
    SupplySchedule internal supplySchedule;
    StakingRewards internal stakingRewardsV1;
    MultipleMerkleDistributor internal tradingRewards;

    uint256[] internal entryIDs;

    /*//////////////////////////////////////////////////////////////
                                Setup
    //////////////////////////////////////////////////////////////*/

    function setUp() public virtual {
        // Setup StakingV1
        treasury = createUser();
        owner = address(this);
        user1 = createUser();
        user2 = createUser();
        user3 = createUser();
        user4 = createUser();
        user5 = createUser();
        dextoro = new DexToro(
            "DexToro",
            "DTORO",
            INITIAL_SUPPLY,
            address(this),
            treasury
        );
        rewardEscrowV1 = new RewardEscrow(address(this), address(dextoro));
        supplySchedule = new SupplySchedule(address(this), treasury);
        supplySchedule.setDexToro(dextoro);
        dextoro.setSupplySchedule(address(supplySchedule));
        stakingRewardsV1 = new StakingRewards(
            address(dextoro),
            address(rewardEscrowV1),
            address(supplySchedule)
        );
        tradingRewards = new MultipleMerkleDistributor(address(this), address(dextoro));
        supplySchedule.setStakingRewards(address(stakingRewardsV1));
        supplySchedule.setTradingRewards(address(tradingRewards));
        rewardEscrowV1.setStakingRewards(address(stakingRewardsV1));
    }
}
