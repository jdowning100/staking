# Quai Token Vesting Claims Site

A simple web application that allows users to connect their Pelagus wallet and check for any vested tokens they may have available to claim from a MultiBeneficiaryVesting contract.

## Features

- Connect Pelagus wallet to check vesting schedules
- View total allocation, released amount, and currently claimable tokens
- See vesting schedule details (start block, duration, etc.)
- Claim vested tokens with a single click
- Automatically refreshes vesting data

## Prerequisites

- Node.js (v20.x)
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
npm install
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
   NEXT_PUBLIC_APP_TITLE=Quai Token Vesting Claims
   NEXT_PUBLIC_APP_DESCRIPTION=Check and claim your vested Quai tokens

   # Formatting Constants
   NEXT_PUBLIC_TOKEN_SYMBOL=QUAI
   NEXT_PUBLIC_TOKEN_DECIMALS=18
   ```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Production Deployment

1. Set up environment variables in your hosting platform (e.g., Vercel):

   - Copy all variables from `.env.example`
   - Update the values for your production environment
   - Update `NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS` to your production contract address

2. Deploy the application:
   ```bash
   npm run build
   npm start
   ```

## Environment Variables

### Required Variables

| Variable                               | Description                     | Example                                    |
| -------------------------------------- | ------------------------------- | ------------------------------------------ |
| `NEXT_PUBLIC_RPC_URL`                  | Quai Network RPC endpoint       | https://orchard.rpc.quai.network           |
| `NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS` | Address of the vesting contract | 0x006ec74887Ec9c0226F2b446af886f20A6e7845B |
| `NEXT_PUBLIC_APP_TITLE`                | Application title               | Quai Token Vesting Claims                  |
| `NEXT_PUBLIC_APP_DESCRIPTION`          | Application description         | Check and claim your vested Quai tokens    |
| `NEXT_PUBLIC_TOKEN_SYMBOL`             | Token symbol                    | QUAI                                       |
| `NEXT_PUBLIC_TOKEN_DECIMALS`           | Token decimals                  | 18                                         |

## Smart Contract

The site interacts with a MultiBeneficiaryVesting contract that has the following key functions:

- `beneficiaries(address)`: Returns vesting schedule for a given address
- `getClaimableAmount(address)`: Returns the amount of tokens currently available for claiming
- `release()`: Allows a beneficiary to claim their vested tokens

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
