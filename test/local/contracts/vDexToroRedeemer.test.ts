import {expect} from 'chai';
import hre, {ethers} from 'hardhat';
import {Contract} from '@ethersproject/contracts';
import {FakeContract, smock} from '@defi-wonderland/smock';
import {SupplySchedule} from '../../../typechain/SupplySchedule';
import {StakingRewards} from '../../../typechain/StakingRewards';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';

describe('vDexToro Redemption', function () {
    const NAME = 'DexToro';
    const SYMBOL = 'DTORO';
    const DTORO_INITIAL_SUPPLY = ethers.utils.parseUnits('25000000'); // 25000000

    const vDTORO_INITIAL_SUPPLY = ethers.utils.parseUnits('10000'); // 10_000
    const REDEEMER_DTORO_SUPPLY = ethers.utils.parseUnits('9000'); // 9_000

    let dextoro: Contract;
    let vDexToro: Contract;
    let vDextoroRedeemer: Contract;

    let supplySchedule: FakeContract<SupplySchedule>;
    let stakingRewards: FakeContract<StakingRewards>;

    let owner: SignerWithAddress;
    let treasuryDAO: SignerWithAddress;
    let beneficiary: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    beforeEach(async () => {
        [owner, treasuryDAO, beneficiary, user1, user2] =
            await ethers.getSigners();

        supplySchedule = await smock.fake('SupplySchedule');
        stakingRewards = await smock.fake('contracts/StakingRewards.sol:StakingRewards');

        // Deploy DexToro (i.e. token)
        const DexToro = await ethers.getContractFactory('DexToro');
        dextoro = await DexToro.deploy(
            NAME,
            SYMBOL,
            DTORO_INITIAL_SUPPLY,
            owner.address,
            treasuryDAO.address
        );
        await dextoro.deployed();
        await dextoro.setSupplySchedule(supplySchedule.address);

        // Deploy vDexToro (i.e. vToken)
        const VDexToro = await ethers.getContractFactory('vDexToro');
        vDexToro = await VDexToro.deploy(
            NAME,
            SYMBOL,
            beneficiary.address,
            vDTORO_INITIAL_SUPPLY
        );
        await vDexToro.deployed();

        // Deploy VKwentaRedeemer
        const VKwentaRedeemer = await ethers.getContractFactory(
            'vDextoroRedeemer'
        );
        vDextoroRedeemer = await VKwentaRedeemer.deploy(
            vDexToro.address,
            dextoro.address
        );
        await vDextoroRedeemer.deployed();

        // Fund VKwentaRedeemer with $DTORO
        // @notice only sending vDextoroRedeemer 9_000 $DTORO (10_000 exists)
        await hre.network.provider.send('hardhat_setBalance', [
            supplySchedule.address,
            '0x1000000000000000',
        ]);
        const impersonatedSupplySchedule = await ethers.getSigner(
            supplySchedule.address
        );
        await dextoro
            .connect(impersonatedSupplySchedule)
            .mint(vDextoroRedeemer.address, REDEEMER_DTORO_SUPPLY);

        // Trasnfer $vDTORO to user1
        await vDexToro
            .connect(beneficiary)
            .transfer(user1.address, ethers.utils.parseUnits('1000'));
    });

    it('balances are correct', async function () {
        expect(await vDexToro.balanceOf(beneficiary.address)).to.equal(
            ethers.utils.parseUnits('9000')
        );
        expect(await vDexToro.balanceOf(user1.address)).to.equal(
            ethers.utils.parseUnits('1000')
        );
        expect(await dextoro.balanceOf(vDextoroRedeemer.address)).to.equal(
            ethers.utils.parseUnits('9000')
        );
    });

    it('Caller without vDexToro cant redeem', async function () {
        expect(await vDexToro.balanceOf(user2.address)).to.equal(0);
        await expect(
            vDextoroRedeemer.connect(user2).redeem()
        ).to.be.revertedWith('vDextoroRedeemer: No balance to redeem');
    });

    it('User cannot redeem if vDextoroRedeemer is not approved to spend vDexToro', async function () {
        // attempt to redeem before approving
        await expect(
            vDextoroRedeemer.connect(beneficiary).redeem()
        ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
    });

    it('Can redeem dextoro for vDexToro', async function () {
        let beneficiaryBalanceToRedeem = await vDexToro.balanceOf(beneficiary.address);

        await vDexToro
            .connect(beneficiary)
            .approve(vDextoroRedeemer.address, beneficiaryBalanceToRedeem);
        await vDextoroRedeemer.connect(beneficiary).redeem();

        expect(await vDexToro.balanceOf(beneficiary.address)).to.equal(0);
        expect(await dextoro.balanceOf(beneficiary.address)).to.equal(
            beneficiaryBalanceToRedeem
        );
        expect(await dextoro.balanceOf(vDextoroRedeemer.address)).to.equal(0);
    });

    it('Can only redeem up to the amount of dextoro vDextoroRedeemer has', async function () {
        let beneficiaryBalanceToRedeem = await vDexToro.balanceOf(beneficiary.address);

        await vDexToro
            .connect(beneficiary)
            .approve(vDextoroRedeemer.address, beneficiaryBalanceToRedeem);
        await vDextoroRedeemer.connect(beneficiary).redeem();

        // @notice previous lines redeemed all dextoro in vDextoroRedeemer contract
        
        let user1BalanceToRedeem = await vDexToro.balanceOf(user1.address);

        await vDexToro
            .connect(user1)
            .approve(vDextoroRedeemer.address, user1BalanceToRedeem);
        await expect(
            vDextoroRedeemer.connect(user1).redeem()
        ).to.be.revertedWith('vDextoroRedeemer: Insufficient contract balance');
    });
});
