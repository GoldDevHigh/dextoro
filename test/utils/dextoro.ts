import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber, Contract } from "ethers";
import { ethers } from "hardhat";

// core contracts
let dextoro: Contract;
let supplySchedule: Contract;
let rewardEscrow: Contract;
let stakingRewards: Contract;

/**
 * Deploys core contracts
 * @dev Libraries that the core contracts depend on are also deployed, but not returned
 * @param NAME: token name (ex: dextoro)
 * @param SYMBOL: symbol of token (ex: DTORO)
 * @param INITIAL_SUPPLY: number of tokens
 * @param owner: EOA used to deploy contracts
 * @param TREASURY_DAO: contract address of TREASURY
 * @returns dextoro, supplySchedule, rewardEscrow, stakingRewardsProxy
 */
export const deployDexToro = async (
    NAME: string,
    SYMBOL: string,
    INITIAL_SUPPLY: BigNumber,
    owner: SignerWithAddress,
    TREASURY_DAO: SignerWithAddress
) => {
    // deploy SafeDecimalMath
    const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
    const safeDecimalMath = await SafeDecimalMath.connect(owner).deploy();
    await safeDecimalMath.deployed();

    // deploy DexToro
    const DexToro = await ethers.getContractFactory("DexToro");
    dextoro = await DexToro.connect(owner).deploy(
        NAME,
        SYMBOL,
        INITIAL_SUPPLY,
        owner.address,
        TREASURY_DAO.address
    );
    await dextoro.deployed();

    // deploy SupplySchedule
    const SupplySchedule = await ethers.getContractFactory("SupplySchedule", {
        libraries: {
            SafeDecimalMath: safeDecimalMath.address,
        },
    });
    supplySchedule = await SupplySchedule.connect(owner).deploy(
        owner.address,
        TREASURY_DAO.address
    );
    await supplySchedule.deployed();

    await dextoro.setSupplySchedule(supplySchedule.address);
    await supplySchedule.setDexToro(dextoro.address);

    // deploy RewardEscrow
    const RewardEscrow = await ethers.getContractFactory("RewardEscrow");
    rewardEscrow = await RewardEscrow.connect(owner).deploy(
        owner.address,
        dextoro.address
    );
    await rewardEscrow.deployed();

    // deploy StakingRewards
    const StakingRewards = await ethers.getContractFactory("contracts/StakingRewards.sol:StakingRewards");
    stakingRewards = await StakingRewards.connect(owner).deploy(
        dextoro.address,
        rewardEscrow.address,
        supplySchedule.address
    );
    await stakingRewards.deployed();

    // set StakingRewards address in SupplySchedule
    await supplySchedule.setStakingRewards(stakingRewards.address);

    // set StakingRewards address in RewardEscrow
    await rewardEscrow.setStakingRewards(stakingRewards.address);

    return {
        dextoro,
        supplySchedule,
        rewardEscrow,
        stakingRewards
    };
};
