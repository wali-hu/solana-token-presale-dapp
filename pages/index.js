// pages/index.js
import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from "@solana/web3.js";
import { Program, AnchorProvider, web3, BN } from "@project-serum/anchor";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from "@solana/spl-token";

import IDL from "../lib/idl.json";

// Dynamically import WalletMultiButton with SSR disabled
const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

const ENV_PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID;
const ENV_ICO_MINT = process.env.NEXT_PUBLIC_ICO_MINT;

// Program constants
const PROGRAM_ID = new PublicKey(ENV_PROGRAM_ID);
const ICO_MINT = new PublicKey(ENV_ICO_MINT);
const TOKEN_DECIMALS = new BN(1_000_000_000);

export default function Home() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [icoData, setIcoData] = useState(null);
  const [amount, setAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState(null);

  useEffect(() => {
    if (wallet.connected) {
      checkIfAdmin();
      fetchIcoData();
      fetchUserTokenBalance();
    }
  }, [wallet.connected]);

  const getProgram = () => {
    if (!wallet.connected) return null;
    const provider = new AnchorProvider(connection, wallet, {
      commitment: "confirmed",
    });
    return new Program(IDL, PROGRAM_ID, provider);
  };

  const checkIfAdmin = async () => {
    try {
      const program = getProgram();
      if (!program) return;

      console.log("Checking admin status for:", wallet.publicKey.toString());

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      try {
        const data = await program.account.data.fetch(dataPda);
        setIsAdmin(data.admin.equals(wallet.publicKey));
      } catch (e) {
        const accounts = await program.account.data.all();
        if (accounts.length === 0) {
          setIsAdmin(true); // First user becomes admin
        } else {
          setIsAdmin(false);
          setIcoData(accounts[0].account);
        }
      }
    } catch (error) {
      console.error("Error checking admin:", error);
      setIsAdmin(false);
    }
  };

  const fetchIcoData = async () => {
    try {
      const program = getProgram();
      if (!program) return;

      const accounts = await program.account.data.all();
      if (accounts.length > 0) {
        setIcoData(accounts[0].account);
      }
    } catch (error) {
      console.error("Error fetching ICO data:", error);
    }
  };

  const createIcoAta = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      const [icoAtaPda] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      const adminIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      await program.methods
        .createIcoAta(new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminIcoAta,
          admin: wallet.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      alert("ICO initialized successfully!");
      await fetchIcoData();
    } catch (error) {
      console.error("Error initializing ICO:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const depositIco = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      const [icoAtaPda] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), wallet.publicKey.toBuffer()],
        program.programId
      );

      const adminIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      await program.methods
        .depositIcoInAta(new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForAdmin: adminIcoAta,
          admin: wallet.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      alert("Tokens deposited successfully!");
      await fetchIcoData();
    } catch (error) {
      console.error("Error depositing:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const buyTokens = async () => {
    try {
      if (!amount || parseInt(amount) <= 0) {
        alert("Please enter a valid amount");
        return;
      }

      setLoading(true);
      const program = getProgram();
      if (!program) return;

      // Calculate cost (0.001 SOL per token)
      const solCost = parseInt(amount) * 0.001;
      const balance = await connection.getBalance(wallet.publicKey);

      if (balance < solCost * 1e9 + 5000) {
        alert(`Insufficient balance. Need ${solCost.toFixed(3)} SOL plus fee`);
        return;
      }

      const [icoAtaPda, bump] = await PublicKey.findProgramAddress(
        [ICO_MINT.toBuffer()],
        program.programId
      );

      const [dataPda] = await PublicKey.findProgramAddress(
        [Buffer.from("data"), icoData.admin.toBuffer()],
        program.programId
      );

      const userIcoAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      // Create ATA if needed
      try {
        await getAccount(connection, userIcoAta);
      } catch (error) {
        const createAtaIx = createAssociatedTokenAccountInstruction(
          wallet.publicKey,
          userIcoAta,
          wallet.publicKey,
          ICO_MINT
        );
        const transaction = new Transaction().add(createAtaIx);
        await wallet.sendTransaction(transaction, connection);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await program.methods
        .buyTokens(bump, new BN(amount))
        .accounts({
          icoAtaForIcoProgram: icoAtaPda,
          data: dataPda,
          icoMint: ICO_MINT,
          icoAtaForUser: userIcoAta,
          user: wallet.publicKey,
          admin: icoData.admin,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      alert(`Successfully purchased ${amount} tokens!`);
      await fetchIcoData();
      await fetchUserTokenBalance();
    } catch (error) {
      console.error("Error buying tokens:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserTokenBalance = async () => {
    try {
      if (!wallet.connected) return;

      const userAta = await getAssociatedTokenAddress(
        ICO_MINT,
        wallet.publicKey
      );

      try {
        const tokenAccount = await getAccount(connection, userAta);
        setUserTokenBalance(tokenAccount.amount.toString());
      } catch (e) {
        // If ATA doesn't exist, balance is 0
        setUserTokenBalance("0");
      }
    } catch (error) {
      console.error("Error fetching token balance:", error);
      setUserTokenBalance("0");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-6 flex flex-col justify-center sm:py-12">
      <div className="relative py-3 sm:max-w-xl sm:mx-auto">
        <div className="relative px-4 py-10 bg-white shadow-lg sm:rounded-3xl sm:p-20">
          <div className="max-w-md mx-auto">
            <div className="divide-y divide-gray-200">
              {/* Header Section */}
              <div className="pb-8">
                <div className="flex justify-between items-center">
                  <h1 className="text-2xl font-bold">Solana ICO</h1>
                  <WalletMultiButton />
                </div>
                {wallet.connected && (
                  <div className="mt-4 text-sm text-gray-600">
                    <p>
                      Wallet: {wallet.publicKey.toString().slice(0, 8)}...
                      {wallet.publicKey.toString().slice(-8)}
                    </p>
                    <p className="mt-1">
                      Status:{" "}
                      <span
                        className={`font-semibold ${
                          isAdmin ? "text-green-600" : "text-blue-600"
                        }`}
                      >
                        {isAdmin ? "Admin" : "User"}
                      </span>
                    </p>
                    <p className="mt-2 p-2 bg-gray-50 rounded-lg">
                      <span className="text-gray-600">Your Token Balance:</span>{" "}
                      <span className="font-semibold">
                        {userTokenBalance
                          ? (Number(userTokenBalance) / 1e9).toFixed(2)
                          : "0"}{" "}
                        tokens
                      </span>
                    </p>
                  </div>
                )}
              </div>

              {/* Main Content */}
              {wallet.connected && (
                <div className="py-8">
                  {/* ICO Status Display */}
                  {icoData ? (
                    <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <h2 className="text-lg font-semibold mb-3">ICO Status</h2>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Total Supply</p>
                          <p className="font-medium">
                            {icoData.totalTokens.toString()} tokens
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Tokens Sold</p>
                          <p className="font-medium">
                            {icoData.tokensSold.toString()} tokens
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-600">Token Price</p>
                          <p className="font-medium">0.001 SOL</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Available</p>
                          <p className="font-medium">
                            {(
                              icoData.totalTokens - icoData.tokensSold
                            ).toString()}{" "}
                            tokens
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-600">Your Balance</p>
                          <p className="font-medium">
                            {userTokenBalance
                              ? (Number(userTokenBalance) / 1e9).toFixed(2)
                              : "0"}{" "}
                            tokens
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    isAdmin && (
                      <div className="mb-8 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <p className="text-yellow-700">
                          ICO needs to be initialized
                        </p>
                      </div>
                    )
                  )}

                  {/* Action Section */}
                  <div className="space-y-4">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={
                        isAdmin
                          ? icoData
                            ? "Amount of tokens to deposit"
                            : "Amount of tokens to initialize"
                          : "Amount of tokens to buy"
                      }
                      className="w-full p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      min="1"
                      step="1"
                    />

                    {/* Cost Display for Users */}
                    {amount && !isAdmin && (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 space-y-2">
                        <div className="flex justify-between">
                          <span>Token Amount:</span>
                          <span className="font-medium">{amount} tokens</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cost:</span>
                          <span className="font-medium">
                            {(parseInt(amount) * 0.001).toFixed(3)} SOL
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Network Fee:</span>
                          <span className="font-medium">~0.000005 SOL</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-semibold">
                          <span>Total:</span>
                          <span>
                            {(parseInt(amount) * 0.001 + 0.000005).toFixed(6)}{" "}
                            SOL
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    {isAdmin ? (
                      <div className="space-y-3">
                        {!icoData && (
                          <button
                            onClick={createIcoAta}
                            disabled={loading}
                            className="w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
                          >
                            {loading ? "Initializing..." : "Initialize ICO"}
                          </button>
                        )}
                        {icoData && (
                          <>
                            <button
                              onClick={depositIco}
                              disabled={loading}
                              className="w-full p-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 transition-colors"
                            >
                              {loading ? "Depositing..." : "Deposit Tokens"}
                            </button>
                            <button
                              onClick={buyTokens}
                              disabled={loading || !icoData}
                              className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                            >
                              {loading ? "Processing..." : "Buy Tokens"}
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={buyTokens}
                        disabled={loading || !icoData}
                        className="w-full p-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 transition-colors"
                      >
                        {loading ? "Processing..." : "Buy Tokens"}
                      </button>
                    )}

                    {/* Transaction Status */}
                    {loading && (
                      <div className="text-center animate-pulse text-gray-600">
                        Processing transaction...
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Not Connected State */}
              {!wallet.connected && (
                <div className="py-8 text-center text-gray-600">
                  Please connect your wallet to continue
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
