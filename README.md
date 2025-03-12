# Quai Token Vesting Claims Site

A simple web application that allows users to connect their Pelagus wallet and check for any vested tokens they may have available to claim from a MultiBeneficiaryVesting contract.

## Features

- Connect Pelagus wallet to check vesting schedules
- View total allocation, released amount, and currently claimable tokens
- See vesting schedule details (start block, duration, etc.)
- Claim vested tokens with a single click
- Automatically refreshes vesting data

## Getting Started

### Prerequisites

- Node.js (v20.x)
- Pelagus wallet extension installed in your browser

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/token-vesting-claim-site.git
cd token-vesting-claim-site
```

2. Install dependencies:

```bash
npm install
```

3. Create an `.env.local` file with the following content:

```
NEXT_PUBLIC_RPC_URL=https://rpc.quai.network
NEXT_PUBLIC_VESTING_CONTRACT_ADDRESS=0x001234567890123456789012345678901234567A
```

4. Start the development server:

```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Smart Contract

The site interacts with a MultiBeneficiaryVesting contract that has the following key functions:

- `beneficiaries(address)`: Returns vesting schedule for a given address
- `getClaimableAmount(address)`: Returns the amount of tokens currently available for claiming
- `release()`: Allows a beneficiary to claim their vested tokens

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
