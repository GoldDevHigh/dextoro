import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { Contract } from "@ethersproject/contracts";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { SupplySchedule } from "../../../typechain/SupplySchedule";
import { StakingRewards } from "../../../typechain/StakingRewards";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { wei } from "@synthetixio/wei";

describe("DTORO Token", function () {
    const NAME = "DexToro";
    const SYMBOL = "DTORO";
    const INITIAL_SUPPLY = ethers.utils.parseUnits("25000000");
    const INFLATION_DIVERSION_BPS = 2000;

    let dextoro: Contract;
    let supplySchedule: FakeContract<SupplySchedule>;
    let stakingRewards: FakeContract<StakingRewards>;

    let owner: SignerWithAddress,
        treasuryDAO: SignerWithAddress,
        user1: SignerWithAddress;
    beforeEach(async () => {
        [owner, treasuryDAO, user1] = await ethers.getSigners();

        supplySchedule = await smock.fake("SupplySchedule");
        stakingRewards = await smock.fake("contracts/StakingRewards.sol:StakingRewards");

        const DexToro = await ethers.getContractFactory("DexToro");
        dextoro = await DexToro.deploy(
            NAME,
            SYMBOL,
            INITIAL_SUPPLY,
            owner.address,
            treasuryDAO.address
        );
        await dextoro.deployed();

        await dextoro.setSupplySchedule(supplySchedule.address);

        return dextoro;
    });

    it('Should deploy "DexToro" token with "DTORO" symbol.', async function () {
        expect(await dextoro.name()).to.equal(NAME);
        expect(await dextoro.symbol()).to.equal(SYMBOL);
    });

    it("Total supply should be 25000000", async function () {
        expect(await dextoro.totalSupply()).to.equal(INITIAL_SUPPLY);
    });

    it("Cannot mint from address other than supply schedule", async () => {
        await expect(dextoro.mint(owner.address, 100)).to.be.revertedWith(
            'DexToro: Only SupplySchedule can perform this action'
        );
    });

    it("Can mint if supplySchedule", async () => {
        await hre.network.provider.send("hardhat_setBalance", [
            supplySchedule.address,
            "0x1000000000000000",
        ]);
        const impersonatedSupplySchedule = await ethers.getSigner(
            supplySchedule.address
        );
        await dextoro
            .connect(impersonatedSupplySchedule)
            .mint(owner.address, 100);
        expect(await dextoro.balanceOf(owner.address)).to.be.equal(100);
    });

    it("Test burn attempt from empty address", async function () {
        await expect(dextoro.connect(user1).burn(1)).to.be.revertedWith(
            "ERC20: burn amount exceeds balance"
        );
    });

    it("Test burn attempt", async function () {
        await dextoro.connect(treasuryDAO).burn(1);
        expect(await dextoro.totalSupply()).to.equal(INITIAL_SUPPLY.sub("1"));
    });
});
