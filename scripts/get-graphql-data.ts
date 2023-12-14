import { request, gql } from "graphql-request";
import { ethers } from "hardhat";
import stakerDistribution from "./distribution/staker-distribution.json";

async function main() {
	const response = (
		await request(
			"https://api.thegraph.com/subgraphs/name/graphthe/optimism-perps",
			gql`
				fragment StatsBody on FuturesStat {
					account
					pnl
					pnlWithFeesPaid
					liquidations
					totalTrades
					totalVolume
				}
				query leaderboardStats($account: String!, $searchTerm: String!) {
					top: futuresStats(
						where: { smartMarginVolume_gt: "0" }
						orderBy: pnlWithFeesPaid
						orderDirection: desc
						first: 100
					) {
						...StatsBody
					}
					bottom: futuresStats(
						where: { smartMarginVolume_gt: "0" }
						orderBy: pnlWithFeesPaid
						orderDirection: asc
						first: 100
					) {
						...StatsBody
					}
					wallet: futuresStats(where: { account: $account }) {
						...StatsBody
					}
					search: futuresStats(where: { account_contains: $searchTerm }) {
						...StatsBody
					}
				}
				`,
			{
				account: "0x21f4f88a95f656ef4ee1ea107569b3b38cf8daef",
				searchTerm: "0x21f4f88a95f656ef4ee1ea107569b3b38cf8daef"
			}
		)
	).deposits as {
		feesPaid: number;
		totalVolume: number;
		account: string;
	}[];
	const pool2PurchaseAmounts = response.map(
		({ feesPaid, totalVolume, account }) => {

			const stakerValue = stakerDistribution.find((staker) => staker.address === account)
			const rewards_score = feesPaid * Number(stakerValue?.earnings);

			return {
				address: ethers.utils.getAddress(account),
				amount: rewards_score,
			};
		}
	);

	console.log(pool2PurchaseAmounts)

}

main();
