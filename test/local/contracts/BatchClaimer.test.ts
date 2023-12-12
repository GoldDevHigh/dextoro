import { expect } from "chai";
import { ethers } from "hardhat";
import { Contract, BigNumber } from "ethers";
import { smock } from "@defi-wonderland/smock";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import BalanceTree from "../../../scripts/merkle/balance-tree";
import { deployDexToro } from "../../utils/dextoro";

require("chai")
    .use(require("chai-as-promised"))
    .use(require("chai-bn-equal"))
    .use(smock.matchers)
    .should();

// constants
const NAME = "DexToro";
const SYMBOL = "DTORO";
const INITIAL_SUPPLY = ethers.utils.parseUnits("25000000");
const EPOCH_ZERO = 0;
const EPOCH_ONE = 1;

// test accounts
let owner: SignerWithAddress;
let addr0: SignerWithAddress;
let addr1: SignerWithAddress;
let addr2: SignerWithAddress;
let TREASURY_DAO: SignerWithAddress;

// core contracts
let dextoro: Contract;
let rewardEscrow: Contract;

const loadSetup = () => {
    beforeEach("Deploy contracts", async () => {
        [owner, addr0, addr1, addr2, TREASURY_DAO] = await ethers.getSigners();

        let deployments = await deployDexToro(
            NAME,
            SYMBOL,
            INITIAL_SUPPLY,
            owner,
            TREASURY_DAO
        );
        dextoro = deployments.dextoro;
        rewardEscrow = deployments.rewardEscrow;
    });
};

describe("BatchClaimer", () => {
    loadSetup();

    describe("claim across two contracts", () => {
        let distributor1: Contract;
        let distributor2: Contract;
        let batchClaimer: Contract;
        let tree: BalanceTree;
        let tree2: BalanceTree;
        beforeEach("deploy", async () => {
            // Build tree with:
            // (1) addresses who can claim DTORO
            // (2) amount given address can claim
            tree = new BalanceTree([
                { account: addr0.address, amount: BigNumber.from(100) },
                { account: addr1.address, amount: BigNumber.from(101) },
                { account: addr2.address, amount: BigNumber.from(202) },
            ]);

            tree2 = new BalanceTree([
                { account: addr0.address, amount: BigNumber.from(1100) },
                { account: addr1.address, amount: BigNumber.from(1101) },
            ]);

            const EscrowedMultipleMerkleDistributor =
                await ethers.getContractFactory(
                    "EscrowedMultipleMerkleDistributor"
                );
            const BatchClaimer = await ethers.getContractFactory(
                "BatchClaimer"
            );

            distributor1 = await EscrowedMultipleMerkleDistributor.deploy(
                owner.address,
                dextoro.address,
                rewardEscrow.address
            );
            await distributor1.deployed();
            distributor2 = await EscrowedMultipleMerkleDistributor.deploy(
                owner.address,
                dextoro.address,
                rewardEscrow.address
            );
            await distributor2.deployed();
            batchClaimer = await BatchClaimer.deploy();
            await batchClaimer.deployed();

            await distributor1.setMerkleRootForEpoch(
                tree.getHexRoot(),
                EPOCH_ZERO
            );
            await distributor1.setMerkleRootForEpoch(
                tree2.getHexRoot(),
                EPOCH_ONE
            );
            await distributor2.setMerkleRootForEpoch(
                tree2.getHexRoot(),
                EPOCH_ZERO
            );

            await expect(() =>
                dextoro
                    .connect(TREASURY_DAO)
                    .transfer(distributor1.address, 2000)
            ).to.changeTokenBalance(dextoro, distributor1, 2000);
            await expect(() =>
                dextoro
                    .connect(TREASURY_DAO)
                    .transfer(distributor2.address, 2000)
            ).to.changeTokenBalance(dextoro, distributor2, 2000);
        });

        it("revert if claims length mismatch", async () => {
            let claims: any = [];
            const distributors = [distributor1.address, distributor2.address];

            await expect(
                batchClaimer.claimMultiple(distributors, claims)
            ).to.be.revertedWith("BatchClaimer: invalid input");
        });

        it("revert if distributor length mismatch", async () => {
            let claims = [];
            claims.push([
                [
                    0,
                    addr0.address,
                    100,
                    tree.getProof(0, addr0.address, BigNumber.from(100)),
                    EPOCH_ZERO,
                ],
            ]);

            claims.push([
                [
                    0,
                    addr0.address,
                    1100,
                    tree2.getProof(0, addr0.address, BigNumber.from(1100)),
                    EPOCH_ZERO,
                ],
            ]);

            const distributors: any = [];

            await expect(
                batchClaimer.claimMultiple(distributors, claims)
            ).to.be.revertedWith("BatchClaimer: invalid input");
        });

        it("can claim across distribution contracts", async () => {
            let claims = [];

            claims.push([
                [
                    0,
                    addr0.address,
                    100,
                    tree.getProof(0, addr0.address, BigNumber.from(100)),
                    EPOCH_ZERO,
                ],
            ]);

            claims.push([
                [
                    0,
                    addr0.address,
                    1100,
                    tree2.getProof(0, addr0.address, BigNumber.from(1100)),
                    EPOCH_ZERO,
                ],
            ]);

            const distributors = [distributor1.address, distributor2.address];

            await expect(batchClaimer.claimMultiple(distributors, claims))
                .to.emit(distributor1, "Claimed")
                .withArgs(0, addr0.address, 100, EPOCH_ZERO)
                .to.emit(distributor2, "Claimed")
                .withArgs(0, addr0.address, 1100, EPOCH_ZERO);

            expect(await rewardEscrow.balanceOf(addr0.address)).to.equal(1200);
        });

        it("can claim multiple epochs across distribution contracts", async () => {
            let claims = [];

            claims.push([
                [
                    0,
                    addr0.address,
                    100,
                    tree.getProof(0, addr0.address, BigNumber.from(100)),
                    EPOCH_ZERO,
                ],
                [
                    0,
                    addr0.address,
                    1100,
                    tree2.getProof(0, addr0.address, BigNumber.from(1100)),
                    EPOCH_ONE,
                ],
            ]);

            claims.push([
                [
                    0,
                    addr0.address,
                    1100,
                    tree2.getProof(0, addr0.address, BigNumber.from(1100)),
                    EPOCH_ZERO,
                ],
            ]);

            const distributors = [distributor1.address, distributor2.address];

            await expect(batchClaimer.claimMultiple(distributors, claims))
                .to.emit(distributor1, "Claimed")
                .withArgs(0, addr0.address, 100, EPOCH_ZERO)
                .to.emit(distributor1, "Claimed")
                .withArgs(0, addr0.address, 1100, EPOCH_ONE)
                .to.emit(distributor2, "Claimed")
                .withArgs(0, addr0.address, 1100, EPOCH_ZERO);
            expect(await rewardEscrow.balanceOf(addr0.address)).to.equal(2300);
        });
    });
});
