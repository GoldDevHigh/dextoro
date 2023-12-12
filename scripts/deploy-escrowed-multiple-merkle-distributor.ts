import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { saveDeployments, verify } from "./utils";
// import { address as DTORO_ADDRESS } from "../deployments/optimistic-goerli/DexToro.json";
// import v2addresses from "../deploy-addresses/optimism-goerli.json";
import { address as DTORO_ADDRESS } from "../deployments/optimistic-mainnet/DexToro.json";
// import { address as REWARD_ESCROW_ADDRESS } from "../deployments/optimistic-mainnet/RewardEscrow.json";
import v2addresses from "../deploy-addresses/optimism-mainnet.json";

const REWARD_DISTRIBUTOR = "0x3723Ac5e62EB80FA8A175cF7a6B1D7EdCad09b3F";
const REWARD_ESCROW_ADDRESS = v2addresses["RewardEscrowV2 Proxy"];
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const tradingRewards = await deployEscrowedMultipleMerkleDistributor(
        deployer,
        DTORO_ADDRESS,
        REWARD_ESCROW_ADDRESS
    );

    await tradingRewards.nominateNewOwner(REWARD_DISTRIBUTOR);
    console.log(
        "TradingRewards nominated owner:         ",
        await tradingRewards.nominatedOwner()
    );
}

async function deployEscrowedMultipleMerkleDistributor(
    owner: SignerWithAddress,
    dextoro: string,
    rewardEscrow: string
) {
    const EscrowedMultipleMerkleDistributor = await ethers.getContractFactory(
        "EscrowedMultipleMerkleDistributor"
    );
    const escrowedMultipleMerkleDistributor =
        await EscrowedMultipleMerkleDistributor.deploy(
            owner.address,
            dextoro,
            rewardEscrow
        );
    await escrowedMultipleMerkleDistributor.deployed();
    await saveDeployments(
        "EscrowedMultipleMerkleDistributor",
        escrowedMultipleMerkleDistributor
    );
    console.log(
        "EscrowedMultipleMerkleDistributor deployed to:        ",
        escrowedMultipleMerkleDistributor.address
    );

    await verify(
        escrowedMultipleMerkleDistributor.address,
        [owner.address, dextoro, rewardEscrow],
        "contracts/EscrowedMultipleMerkleDistributor.sol:EscrowedMultipleMerkleDistributor" // to prevent bytecode clashes with contracts-exposed versions
    );

    return escrowedMultipleMerkleDistributor;
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
