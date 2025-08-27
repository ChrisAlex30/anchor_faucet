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

describe("anchor_faucet::initialize (existing mint on localhost/devnet)", () => {
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




  it("mints 1 token to admin's ATA via PDA authority", async () => {
    // 1) read mint from env
    const mintStr = process.env.MINT?.trim();
    if (!mintStr) throw new Error("Set env var MINT to your existing mint address");
    const mint = new PublicKey(mintStr);

    // 2) decide token program (classic vs token-2022)
    const info = await provider.connection.getAccountInfo(mint);
    if (!info) throw new Error("Mint not found on this cluster");
    const tokenProgram =
      info.owner.toBase58() === TOKENZ ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    // 3) derive config PDA ["config", mint]
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config"), mint.toBuffer()],
      program.programId
    );

    // 4) sanity: ensure PDA is current mint authority
    const mintInfo = await getMint(provider.connection, mint, undefined, tokenProgram);
    expect(mintInfo.mintAuthority, "mint has no authority").to.not.equal(null);
    expect((mintInfo.mintAuthority as PublicKey).toBase58()).to.eq(configPda.toBase58());

    // 5) ensure recipient ATA exists (admin’s wallet here)
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

    // 6) balance before
    const beforeAcc = await getAccount(provider.connection, ata.address, "confirmed", tokenProgram);
    const before = beforeAcc.amount; // bigint (base units)

    // 7) drip 1 whole token (assuming 6 decimals => 1_000_000 base units)
    const amount = new BN(1_000_000);
    await program.methods
      .drip(amount)
      .accounts({
        admin: wallet.publicKey, // must equal config.admin
        mint,
        to: ata.address,
        tokenProgram,
      })
      .rpc();

    // 8) balance after
    const afterAcc = await getAccount(provider.connection, ata.address, "confirmed", tokenProgram);
    const after = afterAcc.amount;

    // 9) assert delta
    expect(Number(after - before)).to.equal(1_000_000);
  });


  it("rejects drip from non-admin", async () => {
  const mint = new PublicKey(process.env.MINT!.trim());
  const info = await provider.connection.getAccountInfo(mint);
  const tokenProgram = info!.owner.toBase58() === TOKENZ ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config"), mint.toBuffer()],
    program.programId
  );

  // fresh throwaway signer
  const bad = anchor.web3.Keypair.generate();
  await provider.connection.requestAirdrop(bad.publicKey, 1e9);

  // ATA for bad signer
  const ata = await getOrCreateAssociatedTokenAccount(
    provider.connection,
    wallet.payer,
    mint,
    bad.publicKey,
    true,
    "confirmed",
    undefined,
    tokenProgram
  );

  let failed = false;
  try {
    await program.methods.drip(new BN(1_000_000)).accounts({
      admin: bad.publicKey,  // not the stored admin
      mint,
      to: ata.address,
      tokenProgram,
    }).signers([bad]).rpc();
  } catch { failed = true; }
  expect(failed).to.eq(true);
});


});
