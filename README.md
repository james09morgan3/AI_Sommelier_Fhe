# AI Sommelier: Your Personal Wine Advisor 🍷

AI Sommelier leverages **Zama's Fully Homomorphic Encryption technology** to offer users a secure and personalized wine recommendation experience. This innovative AI agent acts as your personal sommelier, utilizing encrypted tasting notes and preferences to deliver tailored wine suggestions without compromising your privacy.

## Problem Statement

Wine enthusiasts often face challenges when trying to find the perfect wine pairings that align with their personal tastes and dietary choices. Traditional recommendation systems may not cater to individual preferences or protect valuable consumer data, leaving users vulnerable to privacy breaches. As a result, enthusiasts are left with generic advice that fails to enhance their wine experience.

## The FHE Solution

By employing **Zama's open-source libraries** such as **Concrete** and the **zama-fhe SDK**, AI Sommelier solves the problem of privacy in the wine recommendation process. Fully Homomorphic Encryption allows the AI to perform operations on encrypted data, meaning that it can analyze your tasting notes without ever needing to decrypt or access sensitive information. This ensures that your personal preferences and consumption habits remain confidential while still receiving expert-level advice.

## Key Features

- **FHE-Encrypted Tasting Notes:** Users can input their FHE-encrypted tasting notes and preferences securely.
- **Homomorphic Wine Recommendations:** Enjoy personalized wine pairings generated through homomorphic execution, ensuring privacy.
- **Expert-Level Suggestions:** Receive curated wine recommendations that match your unique flavor profile and food pairings.
- **Personal Cellar Management:** Keep track of your wine collection and get AI-assisted suggestions on what to enjoy next.

## Technology Stack

- **Zama's Fully Homomorphic Encryption SDK**
- **Node.js**
- **Hardhat/Foundry for Smart Contract Development**
- **TypeScript for Enhanced Development Experience**
- **Express for RESTful API Integration**

## Directory Structure

```
AI_Sommelier_Fhe/
├── contracts/
│   └── AI_Sommelier.sol
├── src/
│   ├── index.ts
│   ├── recommendations.ts
│   └── utils.ts
├── tests/
│   └── recommendations.test.ts
└── package.json
```

## Installation Guide

To set up the AI Sommelier project, ensure you have the following prerequisites installed:

1. **Node.js**: Make sure you have Node.js installed on your machine.
2. **Hardhat or Foundry**: Choose between Hardhat or Foundry based on your preference for smart contract development.

### Setup Instructions

1. **Navigate** to your project folder.
2. **Install dependencies** by running:
   ```bash
   npm install
   ```
   This command will fetch the required Zama FHE libraries along with other dependencies specified in `package.json`.

## Build & Run Guide

Once the setup is complete, you can compile and run the AI Sommelier project. Here are the steps:

### Compile the Smart Contract

Use the following command to compile the `AI_Sommelier` smart contract:

```bash
npx hardhat compile
```

### Test the Application

To run tests and ensure everything is working correctly, execute:

```bash
npx hardhat test
```

### Start the Application

Finally, to start the application and interact with the AI Sommelier, use:

```bash
npm run start
```

### Code Example

Here's a simplified example demonstrating how to get wine recommendations based on your encrypted tasting notes:

```typescript
import { EncryptedTastingNotes } from './types';
import { getWineRecommendations } from './recommendations';

const userTastingNotes: EncryptedTastingNotes = encryptTastingNotes({
  notes: "Fruity, dry, medium-bodied",
  pairings: "Seafood, light cheeses"
});

const recommendations = await getWineRecommendations(userTastingNotes);
console.log("Recommended Wines:", recommendations);
```

In this snippet, the `encryptTastingNotes` function would take the user's input and encrypt it using Zama’s FHE capabilities, ensuring that all recommendations are made with the utmost privacy in mind.

## Acknowledgements

### Powered by Zama

A special thank you to the Zama team for their groundbreaking work in developing the tools and resources that make confidential blockchain applications like the AI Sommelier possible. Their commitment to privacy and security enhances our project and empowers users to enjoy personalized experiences without sacrificing data integrity.
