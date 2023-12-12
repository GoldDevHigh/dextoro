// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "@synthetixio/wei";
import { Contract } from "ethers";
import hre, { artifacts, ethers } from "hardhat";
import { saveDeployments, verify } from "./utils";

const isLocal = hre.network.name == "localhost";
const isTestnet = hre.network.name == "optimistic-goerli";

const TEST_WALLET = "0xdB4e4Cd74E9BfDf78E4dA8d2953bb624FBeBe6b3";
const MULTISIG = isTestnet
    ? TEST_WALLET
    : "0x3723Ac5e62EB80FA8A175cF7a6B1D7EdCad09b3F";
const TREASURY_DAO = isTestnet                                
    ? TEST_WALLET
    : "0xD35b90DF61716E2A559F009cFb09a56650B8fD52";
const INITIAL_SUPPLY = 25000000;
// const VDTORO = "0x6789D8a7a7871923Fc6430432A602879eCB6520a";

async function main() {
    const [deployer] = await ethers.getSigners();

    /* ========== DEPLOYMENT ========== */

    console.log("\n💥 Beginning deployments...");
    const dextoro = await deployDexToro(deployer);
    const safeDecimalMath = await deploySafeDecimalMath();
    const supplySchedule = await deploySupplySchedule(
        deployer,
        safeDecimalMath
    );
    const rewardEscrow = await deployRewardEscrow(deployer, dextoro);
    const stakingRewards = await deployStakingRewards(
        deployer,
        dextoro,
        rewardEscrow,
        supplySchedule
    );
    // const vDextoroRedeemer = await deployvDexToroRedeemer(dextoro);
    const tradingRewards = await deployMultipleMerkleDistributor(
        deployer,
        dextoro,
        rewardEscrow
    );
    console.log("✅ Deployments complete!");

    /* ========== SETTERS ========== */

    console.log("\n🔩 Configuring setters...");
    // set SupplySchedule for dextoro
    await dextoro.setSupplySchedule(supplySchedule.address);
    console.log(
        "DexToro: SupplySchedule address set to:          ",
        await dextoro.supplySchedule()
    );

    // set DTORO address in SupplySchedule
    await supplySchedule.setDexToro(dextoro.address);
    console.log(
        "SupplySchedule: DexToro address set to:          ",
        await supplySchedule.dextoro()
    );

    // set StakingRewards address in SupplySchedule
    await supplySchedule.setStakingRewards(stakingRewards.address);
    console.log(
        "SupplySchedule: StakingRewards address set to:  ",
        await supplySchedule.stakingRewards()
    );

    // set TradingRewards (i.e. MultipleMerkleDistributor) address in SupplySchedule
    await supplySchedule.setTradingRewards(tradingRewards.address);
    console.log(
        "SupplySchedule: TradingRewards address set to:  ",
        await supplySchedule.tradingRewards()
    );

    // set StakingRewards address in RewardEscrow
    await rewardEscrow.setTreasuryDAO(TREASURY_DAO);
    console.log(
        "RewardEscrow: TreasuryDAO address set to:       ",
        await rewardEscrow.treasuryDAO()
    );
    console.log("✅ Setters set!");

    // set StakingRewards address in RewardEscrow
    await rewardEscrow.setStakingRewards(stakingRewards.address);
    console.log(
        "RewardEscrow: StakingRewards address set to:    ",
        await rewardEscrow.stakingRewards()
    );
    console.log("✅ Setters set!");

    /*
     * @TODO: Deploy ControlL2MerkleDistributor on L1 passing deployed merkleDistributor as constructor param
     * @TODO: Call MerkleDistributor.setControlL2MerkleDistributor(), setting ControlL2MerkleDistributor L1 address
     */

    /* ========== DISTRIBUTION ========== */

    // Send DTORO to respective contracts
    console.log("\n🎉 Distributing DTORO...");
    await distributeDTORO(deployer, dextoro);
    console.log("✅ DTORO distributed!");

    /* ========== OWNER NOMINATION ========== */

    console.log("\n🔒 Nominating multisig as owner...");
    await dextoro.nominateNewOwner(MULTISIG);
    console.log(
        "DexToro nominated owner:                 ",
        await dextoro.nominatedOwner()
    );
    await tradingRewards.nominateNewOwner(MULTISIG);
    console.log(
        "TradingRewards nominated owner:         ",
        await tradingRewards.nominatedOwner()
    );
    await supplySchedule.nominateNewOwner(MULTISIG);
    console.log(
        "SupplySchedule nominated owner:         ",
        await supplySchedule.nominatedOwner()
    );
    await rewardEscrow.nominateNewOwner(MULTISIG);
    console.log(
        "RewardEscrow nominated owner:           ",
        await rewardEscrow.nominatedOwner()
    );
    await stakingRewards.nominateNewOwner(MULTISIG);
    console.log(
        "StakingRewards nominated owner:         ",
        await stakingRewards.nominatedOwner()
    );
    console.log("✅ Nomination complete!\n");
}

/************************************************
 * @deployers
 ************************************************/

async function deploySafeDecimalMath() {
    // deploy SafeDecimalMath
    const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
    const safeDecimalMath = await SafeDecimalMath.deploy();
    await safeDecimalMath.deployed();
    await saveDeployments("SafeDecimalMath", safeDecimalMath);
    // console.log("SafeMath library deployed to:          ", safeDecimalMath.address);

    if (!isLocal) {
        await hre.run("verify:verify", {
            address: safeDecimalMath.address,
            noCompile: true,
        });
    }

    return safeDecimalMath;
}

async function deployDexToro(owner: SignerWithAddress) {
    const DexToro = await ethers.getContractFactory("DexToro");
    const dextoro = await DexToro.deploy(
        "DexToro",
        "DTORO",
        wei(INITIAL_SUPPLY).toBN(),
        owner.address,
        owner.address // Send DTORO to deployer first
    );
    await dextoro.deployed();
    await saveDeployments("DexToro", dextoro);
    console.log("DTORO token deployed to:          ", dextoro.address);
    await dextoro.deployTransaction.wait(5);

    await verify(dextoro.address, [
        "DexToro",
        "DTORO",
        wei(INITIAL_SUPPLY).toBN(),
        owner.address,
        owner.address,
    ]);

    return dextoro;
}

async function deploySupplySchedule(
    owner: SignerWithAddress,
    safeDecimalMath: Contract
) {
    const SupplySchedule = await ethers.getContractFactory("SupplySchedule", {
        libraries: {
            SafeDecimalMath: safeDecimalMath.address,
        },
    });
    const supplySchedule = await SupplySchedule.deploy(
        owner.address,
        TREASURY_DAO
    );
    await supplySchedule.deployed();
    await saveDeployments("SupplySchedule", supplySchedule);
    console.log("SupplySchedule deployed to:        ", supplySchedule.address);
    await supplySchedule.deployTransaction.wait(5);

    await verify(supplySchedule.address, [owner.address, TREASURY_DAO]);

    return supplySchedule;
}

async function deployRewardEscrow(owner: SignerWithAddress, dextoro: Contract) {
    const RewardEscrow = await ethers.getContractFactory("RewardEscrow");
    const rewardEscrow = await RewardEscrow.deploy(
        owner.address,
        dextoro.address
    );
    await rewardEscrow.deployed();
    await saveDeployments("RewardEscrow", rewardEscrow);
    console.log("RewardEscrow deployed to:          ", rewardEscrow.address);
    await rewardEscrow.deployTransaction.wait(5);
    await verify(rewardEscrow.address, [owner.address, dextoro.address]);

    return rewardEscrow;
}

async function deployStakingRewards(
    owner: SignerWithAddress,
    dextoro: Contract,
    rewardEscrow: Contract,
    supplySchedule: Contract
) {
    const StakingRewards = await ethers.getContractFactory("contracts/StakingRewards.sol:StakingRewards");
    const stakingRewards = await StakingRewards.connect(owner).deploy(
        dextoro.address,
        rewardEscrow.address,
        supplySchedule.address
    );
    await stakingRewards.deployed();
    // await saveDeployments("StakingRewards", stakingRewards);
    const { deployments } = hre;
    const { save } = deployments;
    const artifact = await deployments.getExtendedArtifact("contracts/StakingRewards.sol:StakingRewards");
    
    let deployment = {
        address: stakingRewards.address,
        ...artifact,
    };

    await save("StakingRewards", deployment);
    console.log("StakingRewards deployed to:        ", stakingRewards.address);
    await stakingRewards.deployTransaction.wait(5);
    await verify(stakingRewards.address, [
        dextoro.address,
        rewardEscrow.address,
        supplySchedule.address,
    ]);

    return stakingRewards;
}

// async function deployvDexToroRedeemer(dextoro: Contract) {
//     const VDexToroRedeemer = await ethers.getContractFactory("vDextoroRedeemer");
//     const vDexToroRedeemer = await VDexToroRedeemer.deploy(
//         VDTORO,
//         dextoro.address
//     );
//     await vDexToroRedeemer.deployed();
//     await saveDeployments("vDextoroRedeemer", vDexToroRedeemer);
//     console.log("vDextoroRedeemer deployed to:       ", vDexToroRedeemer.address);

//     await verify(
//         vDexToroRedeemer.address,
//         [VDTORO, dextoro.address],
//         "contracts/vDextoroRedeemer.sol:vDextoroRedeemer" // to prevent bytecode clashes with contracts-exposed versions
//     );

//     return vDexToroRedeemer;
// }

async function deployMultipleMerkleDistributor(
    owner: SignerWithAddress,
    dextoro: Contract,
    rewardEscrow: Contract
) {
    const MultipleMerkleDistributor = await ethers.getContractFactory(
        "MultipleMerkleDistributor"
    );
    const multipleMerkleDistributor = await MultipleMerkleDistributor.deploy(
        owner.address,
        dextoro.address
    );
    await multipleMerkleDistributor.deployed();
    await saveDeployments(
        "MultipleMerkleDistributor",
        multipleMerkleDistributor
    );
    console.log(
        "TradingRewards deployed to:        ",
        multipleMerkleDistributor.address
    );
    await multipleMerkleDistributor.deployTransaction.wait(5);

    await verify(
        multipleMerkleDistributor.address,
        [owner.address, dextoro.address],
        "contracts/MultipleMerkleDistributor.sol:MultipleMerkleDistributor" // to prevent bytecode clashes with contracts-exposed versions
    );

    return multipleMerkleDistributor;
}

/************************************************
 * @distributions
 ************************************************/

async function distributeDTORO(
    signer: SignerWithAddress,
    dextoro: Contract
) {
    // Transfer 100% DTORO to Treasury
    await dextoro.transfer(TREASURY_DAO, wei(INITIAL_SUPPLY).toBN());

    console.log(
        "TreasuryDAO balance:         ",
        ethers.utils.formatEther(await dextoro.balanceOf(TREASURY_DAO))
    );
    console.log(
        "Final signer balance:        ",
        ethers.utils.formatEther(await dextoro.balanceOf(signer.address))
    );
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
