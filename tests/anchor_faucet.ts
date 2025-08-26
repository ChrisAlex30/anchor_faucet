import * as anchor from "@coral-xyz/anchor";
import { Program,BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { expect } from "chai";
import { AnchorFaucet } from "../target/types/anchor_faucet";

describe("anchor_faucet::initialize (existing mint on localhost)", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const wallet = provider.wallet ;

  // No IDL import needed; use generated types
  const program = anchor.workspace.AnchorFaucet as Program<AnchorFaucet>;

  const TOKENK = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"; // classic
  const TOKENZ = "TokenzQdBNbLqP5VEhT5x6UX7YQG9wG8nJVrpSbxPb"; // token-2022



});
