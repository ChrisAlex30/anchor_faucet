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

  it("moves mint authority to Config PDA (or verifies it's already moved)", async () => {
    console.log("MINT raw =", JSON.stringify(process.env.MINT));

    const mintStr = process.env.MINT;
    if (!mintStr) throw new Error("Set env var MINT to your existing mint address");
    const mint = new PublicKey(mintStr);

    // derive Config PDA = ["config", mint]
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    );
    console.log({configPda});
    

    // decide which token program owns the mint
    const info = await provider.connection.getAccountInfo(mint);
    if (!info) throw new Error("Mint not found");
    const tokenProgram =
      info.owner.toBase58() === TOKENZ ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // pre-check authority
    const pre = await getMint(provider.connection, mint, undefined, tokenProgram);
    const already =
      pre.mintAuthority !== null &&
      (pre.mintAuthority as PublicKey).equals(configPda);

    // call initialize only if needed
    if (!already) {
      await program.methods.initialize().accounts({
        admin: wallet.publicKey,
        mint,
        tokenProgram,
      }).rpc();
    }

    // assert authority moved
    const post = await getMint(provider.connection, mint, undefined, tokenProgram);
    expect(post.mintAuthority, "mint has no authority").to.not.equal(null);
    expect((post.mintAuthority as PublicKey).toBase58()).to.equal(configPda.toBase58());

    // old admin should NOT be able to mint anymore
    const ata = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      wallet.payer,
      mint,
      wallet.publicKey,
      true,
      "confirmed",
      undefined,
      tokenProgram
    );

    let failed = false;
    try {
      await mintTo(
        provider.connection,
        wallet.payer,
        mint,
        ata.address,
        wallet.publicKey, // tries to mint with old admin key
        1,
        [],
        undefined,
        tokenProgram
      );
    } catch {
      failed = true;
    }
    expect(failed, "old admin could not mint after initialize").to.eq(true);
  });






});
