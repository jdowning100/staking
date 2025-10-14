# Quai Token Claims Site

A simple web application that allows users to connect their Pelagus wallet and check for any vested tokens they may have available to claim from a MultiBeneficiaryVesting contract.

## Features

- Connect Pelagus wallet to check vesting schedules
- View total allocation, released amount, and currently claimable tokens
- See vesting schedule details (start block, duration, etc.)
- Claim vested tokens with a single click
- Automatically refreshes vesting data

## Prerequisites

- Node.js (v20.x or later)
- Yarn package manager (v1.22+)
- Pelagus wallet extension installed in your browser
- Git

## Local Development Setup

1. Clone the repository:

```bash
git clone https://github.com/dominant-strategies/token-vesting-claim-site.git
cd token-vesting-claim-site
```

2. Install dependencies:

```bash
yarn install
```

3. Set up environment variables:

   a. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

   b. Update the following required variables in `.env.local`:

   ```
   # Network and Provider Constants
   NEXT_PUBLIC_RPC_URL=https://orchard.rpc.quai.network

   # Vesting Contract Constants
   NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS=0x006ec74887Ec9c0226F2b446af886f20A6e7845B

   # UI Constants
   NEXT_PUBLIC_APP_TITLE=Quai Token Claims
   NEXT_PUBLIC_APP_DESCRIPTION=Check and claim your vested Quai tokens

   # Formatting Constants
   NEXT_PUBLIC_TOKEN_SYMBOL=QUAI
   NEXT_PUBLIC_TOKEN_DECIMALS=18
   ```

4. Start the development server:

```bash
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production Deployment

1. Set up environment variables in your hosting platform (e.g., Vercel):

   - Copy all variables from `.env.example`
   - Update the values for your production environment
   - Update `NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS` to your production contract address

2. Deploy the application:
   ```bash
   yarn build
   yarn start
   ```

## Environment Variables

### Required Variables

| Variable                               | Description                     | Example                                    |
| -------------------------------------- | ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_RPC_URL`                  | Quai Network RPC endpoint       | https://orchard.rpc.quai.network           |
| `NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS` | Address of the vesting contract | 0x006ec74887Ec9c0226F2b446af886f20A6e7845B |
| `NEXT_PUBLIC_APP_TITLE`                | Application title               | Quai Token Claims                          |
| `NEXT_PUBLIC_APP_DESCRIPTION`          | Application description         | Check and claim your vested Quai tokens    |
| `NEXT_PUBLIC_TOKEN_SYMBOL`             | Token symbol                    | QUAI                                       |
| `NEXT_PUBLIC_TOKEN_DECIMALS`           | Token decimals                  | 18                                         |

## Smart Contracts

This app now includes a native staking contract (`SmartChefNative`) that streams rewards linearly over time, and optional LP staking. The frontend reads APR directly from the contract via `getEstimatedAPY(duration)` for 30D and 90D lock periods.

### Native Staking (SmartChefNative) – Streaming Rewards

Key concepts:

- **Streaming model:** Rewards are allocated at a constant `emissionRate` (QUAI per second) to active stakers, capped by the available reward budget (contract's native balance minus reserved principal).
- **Funding:** Send native QUAI to the contract to increase the reward budget (runway). Funding alone does not change APR; APR depends on `emissionRate` vs active stake.
- **APR:** The app calls `getEstimatedAPY(30d)` and `getEstimatedAPY(90d)` to display 30D and 90D APR. 90D APR includes the contract’s lock-duration multiplier.
- **Delay/Exit:** Claiming moves earned rewards into a delayed bucket that unlocks after `REWARD_DELAY_PERIOD`. After unlock, a subsequent claim pays out (without touching principal or exit liquidity).

### End-to-End Deployment Steps

1) Compile

```
npx hardhat clean && npx hardhat compile
```

2) Deploy native staking (writes deployment info and optional metadata)

```
node contracts/deploy.js
```

3) Fund rewards (send native QUAI to the contract address)

- Use your wallet or a simple script/CLI to send QUAI to the deployed contract.

4) Set the emission rate (choose one)

- By duration (stream current budget over a target window, e.g., ~30 days):

```
node contracts/set-emission.js <CONTRACT_ADDRESS> --byDuration 2592000
```

- Fixed rate (explicit QUAI per second):

```
# Example: ~10 QUAI over 30 days ≈ 0.000003858 QUAI/s
node contracts/set-emission.js <CONTRACT_ADDRESS> --rate 0.000003858
```

5) Verify on-chain APR and stream

```
node contracts/read-apy.js <CONTRACT_ADDRESS>
# Prints emissionRate (wei/s), totalStaked, rewardBalance, and APR 30D/90D (bps)
```

6) Point the app to the deployed address and restart

```
# .env (or .env.local)
NEXT_PUBLIC_STAKING_CONTRACT_ADDRESS=<CONTRACT_ADDRESS>

# Restart dev/build to pick up env changes
yarn dev   # or
yarn build && yarn start
```

7) Ongoing operations (post top-ups)

- Top-ups increase runway; APR changes when you adjust `emissionRate`.
- After adding rewards, you can rebalance the stream back to a target runway:

```
node contracts/set-emission.js <CONTRACT_ADDRESS> --byDuration 2592000   # 30 days
```

### Pending Rewards Behavior (streaming)

- `pendingReward(address)` reflects only rewards streamed since the last pool update; it no longer attributes the entire reward budget immediately.
- Claiming (when not in exit) moves streamed pending into the delayed list with unlock time = now + `REWARD_DELAY_PERIOD`. After unlock, a subsequent claim pays out from the available reward budget.

### Helper Scripts

- `contracts/set-emission.js` – Set emission by duration or fixed rate.
- `contracts/read-apy.js` – Inspect `emissionRate`, `totalStaked`, `rewardBalance`, and `getEstimatedAPY` (30D/90D).


## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support, please open an issue in the GitHub repository or contact the development team.
