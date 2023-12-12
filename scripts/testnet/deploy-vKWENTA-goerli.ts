// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
import { wei } from "@synthetixio/wei";
import { BigNumber, Contract } from "ethers";
import hre, { ethers } from "hardhat";
import { saveDeployments } from "../utils";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());
    // Hardhat always runs the compile task when running scripts with its command
    // line interface.
    //
    // If this script is run directly using `node` you may want to call compile
    // manually to make sure everything is compiled
    // await hre.run('compile');

    const DexToro = await ethers.getContractFactory("DexToro");
    const dextoro = DexToro.attach("0xDA0C33402Fc1e10d18c532F0Ed9c1A6c5C9e386C");

    // We get the contract to deploy
    const vKwentaFactory = await ethers.getContractFactory("vDexToro");
    const vDexToro = await vKwentaFactory.deploy(
        "vDexToro",
        "vDTORO",
        "0xC2ecD777d06FFDF8B3179286BEabF52B67E9d991", //treasury
        wei(25000000).mul(0.05).toBN()
    );

    await vDexToro.deployed();
    await saveDeployments("vDexToro", vDexToro);
    await verify(
        vDexToro.address,
        [
            "vDexToro",
            "vDTORO",
            "0xC2ecD777d06FFDF8B3179286BEabF52B67E9d991", //treasury
            wei(25000000).mul(0.05).toBN(),
        ],
        "contracts/vDexToro.sol:vDexToro"
    );

    await deployvDextoroRedeemer(vDexToro, dextoro);

    console.log("vDTORO token deployed to:", vDexToro.address);
    console.log(
        "Total supply is: ",
        wei(await vDexToro.totalSupply(), 18, true).toString()
    );
}

async function deployvDextoroRedeemer(vDexToro: Contract, dextoro: Contract) {
    const VKwentaRedeemer = await ethers.getContractFactory("vDextoroRedeemer");
    const vDextoroRedeemer = await VKwentaRedeemer.deploy(
        vDexToro.address,
        dextoro.address
    );
    await vDextoroRedeemer.deployed();
    await saveDeployments("vDextoroRedeemer", vDextoroRedeemer);
    console.log("vDextoroRedeemer deployed to:       ", vDextoroRedeemer.address);

    await verify(
        vDextoroRedeemer.address,
        [vDexToro.address, dextoro.address],
        "contracts/vDextoroRedeemer.sol:vDextoroRedeemer" // to prevent bytecode clashes with contracts-exposed versions
    );

    return vDextoroRedeemer;
}

type ConstructorArgs = string | BigNumber;
async function verify(
    address: string,
    constructorArgs: Array<ConstructorArgs>,
    contract?: string
) {
    try {
        await hre.run("verify:verify", {
            address: address,
            constructorArguments: constructorArgs,
            contract: contract,
            noCompile: true,
        });
    } catch (e) {
        // Can error out even if already verified
        // We don't want this to halt execution
        console.log(e);
    }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
