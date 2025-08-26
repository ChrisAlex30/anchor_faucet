use anchor_lang::prelude::*;
use anchor_spl::token_interface::{
    self, Mint, 
    SetAuthority, TokenInterface,
    TokenAccount, MintTo,mint_to
};
use anchor_spl::token_interface::spl_token_2022::instruction::AuthorityType;


declare_id!("4edge8VYmNMcnRmM9RzQv89kwgYBid2xVoz5FgPMp3QE");

#[program]
pub mod anchor_faucet {
    use super::*;

     /// One-time setup for a given SPL mint.
    /// - Creates a Config PDA (seeds: ["config", mint])
    /// - Moves the mint authority of `mint` to that PDA.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        // set_authority(mint, MintTokens, new_authority = config_pda)
        let cpi = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                account_or_mint: ctx.accounts.mint.to_account_info(),
                current_authority: ctx.accounts.admin.to_account_info(),
            },
        );
        token_interface::set_authority(
            cpi,
            AuthorityType::MintTokens,
            Some(ctx.accounts.config.key()),
        )?;

        let cfg = &mut ctx.accounts.config;
        cfg.admin = ctx.accounts.admin.key();
        cfg.mint  = ctx.accounts.mint.key();
        cfg.bump  = ctx.bumps.config;
        Ok(())
    }

    pub fn drip(ctx: Context<Drip>, amount: u64) -> Result<()> {
    // (optional) gate so only admin can call
    require_keys_eq!(ctx.accounts.config.admin, ctx.accounts.admin.key());

    // 1) Bind long-lived values
    let mint_key = ctx.accounts.mint.key();               // Pubkey lives in this scope
    let bump_bytes = [ctx.accounts.config.bump];          // &[u8] needs an owned [u8; 1]

    // 2) Build the PDA signer seeds
    //    shape required by new_with_signer: &[&[&[u8]]]
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"config",
        mint_key.as_ref(),
        &bump_bytes,
    ]];

    // 3) CPI: mint_to with PDA as authority
    let cpi = CpiContext::new_with_signer(
        ctx.accounts.token_program.to_account_info(),
        MintTo {
            mint: ctx.accounts.mint.to_account_info(),
            to: ctx.accounts.to.to_account_info(),
            authority: ctx.accounts.config.to_account_info(),
        },
        signer_seeds,
    );

    mint_to(cpi, amount)
}

}

#[derive(Accounts)]
pub struct Drip<'info> {
    /// optional gate: only admin can call drip
    pub admin: Signer<'info>,

    /// the mint you initialized earlier
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// the PDA that is now the mint authority
    #[account(
        seeds = [b"config", mint.key().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,

    /// recipient's token account (must be for `mint`)
    #[account(
        mut,
        token::mint = mint,
    )]
    pub to: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Admin = current mint authority signer & payer for Config rent
    #[account(mut)]
    pub admin: Signer<'info>,

    /// Existing SPL mint to be controlled by the PDA
    #[account(mut)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// PDA that will become the mint authority
    #[account(
        init,
        payer = admin,
        space = 8 + Config::SIZE,
        seeds = [b"config", mint.key().as_ref()],
        bump
    )]
    pub config: Account<'info, Config>,

    /// Accept both classic SPL Token and Token-2022 at runtime
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub mint: Pubkey,
    pub bump: u8,
}
impl Config {
    pub const SIZE: usize = 32 + 32 + 1;
}
