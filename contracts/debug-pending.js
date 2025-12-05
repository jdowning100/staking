#!/usr/bin/env node
/*
  Debug pendingReward for SmartChefLP

  Usage:
    RPC_URL=https://rpc.quai.network \
    DEBUG_RPC_URL=https://debug.rpc.quai.network/cyprus1 \
    CYPRUS1_PK=0x... \
    node contracts/debug-pending.js 0xStakingContract [0xUser]

  - Tries pendingReward(address) first, then falls back to pendingReward() (legacy) for read encoding
  - Attempts eth_createAccessList, logs result
  - If access list fails or indicates revert, sends debug_traceCall to DEBUG_RPC_URL with callTracer
*/

const quais = require('quais');
const crypto = require('crypto');
require('dotenv').config();

async function postJson(url, body) {
  // Use global fetch if available; otherwise fallback to https.request
  if (typeof fetch === 'function') {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json();
  } else {
    const https = require('https');
    const { URL } = require('url');
    const u = new URL(url + '/cyprus1');
    const payload = JSON.stringify(body);
    const options = {
      method: 'POST',
      hostname: u.hostname,
      path: u.pathname,
      port: u.port || 443,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };
    const response = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
    return response;
  }
}

async function main() {
  const [, , contractAddress, userArg] = process.argv;
  if (!contractAddress || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    console.error('Usage: node contracts/debug-pending.js 0xStakingContract [0xUser]');
    process.exit(1);
  }

  const RPC_URL = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.quai.network';
  const DEBUG_RPC_URL = process.env.DEBUG_RPC_URL || 'https://debug.rpc.quai.network/cyprus1';
  const PRIVATE_KEY = process.env.CYPRUS1_PK || process.env.PRIVATE_KEY || process.env.DEPLOYER_KEY;
  if (!PRIVATE_KEY) {
    console.error('Missing private key: set CYPRUS1_PK / PRIVATE_KEY');
    process.exit(1);
  }

  console.log('RPC_URL:', RPC_URL);
  console.log('DEBUG_RPC_URL:', DEBUG_RPC_URL);
  console.log('Target staking contract:', contractAddress);

  const provider = new quais.JsonRpcProvider(RPC_URL, undefined, { usePathing: true });
  const wallet = new quais.Wallet(PRIVATE_KEY, provider);
  const from = await wallet.getAddress();
  const user = userArg && /^0x[0-9a-fA-F]{40}$/.test(userArg) ? userArg : from;
  console.log('User for pendingReward:', user);

  // Minimal interface for encoding
  const ABI = [
    { inputs: [{ name: '_user', type: 'address' }], name: 'pendingReward', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
    { inputs: [], name: 'pendingReward', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
  ];
  const iface = new quais.Interface(ABI);

  // Encode call data, prefer (address)
  let data; let usedSig = null;
  try {
    data = iface.encodeFunctionData('pendingReward(address)', [user]);
    usedSig = 'pendingReward(address)';
  } catch {
    data = iface.encodeFunctionData('pendingReward()', []);
    usedSig = 'pendingReward()';
  }

  // Check code exists
  const code = await provider.getCode(contractAddress);
  if (!code || code === '0x') {
    console.error('No code at target address; wrong network/shard or typo.');
    process.exit(1);
  }

  // Prepare tx object for simulation/access list creation
  const nonce = await provider.getTransactionCount(from).catch(() => 0);
  const txObj = {
    from,
    to: contractAddress,
    data,
    gas: '0x989680', // 10,000,000
    nonce: '0x' + nonce.toString(16),
  };

  // Try eth_createAccessList to see if node returns an error
  console.log('\nAttempting eth_createAccessList...');
  let accessListResult = null;
  try {
    accessListResult = await provider.send('eth_createAccessList', [txObj, 'latest']);
    console.log('Access List Result:', JSON.stringify(accessListResult, null, 2));
  } catch (e) {
    console.log('Access list generation threw:', e?.reason || e?.message || e);
  }

  // If failed or error present, run debug_traceCall
  const hasAccessListError = !accessListResult || accessListResult.error;
  if (hasAccessListError) {
    console.log('\nDebug: Access list generation failed, tracing the failure...');
    const body = {
      jsonrpc: '2.0',
      method: 'debug_traceCall',
      params: [
        {
          from,
          to: contractAddress,
          data,
          gas: txObj.gas,
          nonce: txObj.nonce,
          accessList: accessListResult?.accessList || [],
        },
        'latest',
        { tracer: 'callTracer' },
      ],
      id: Number('0x' + crypto.randomBytes(2).toString('hex')),
    };

    try {
      const debugResult = await postJson(DEBUG_RPC_URL, body);
      console.log('\nDebug Trace Result:', JSON.stringify(debugResult, null, 2));
      if (debugResult?.error || (debugResult?.result && debugResult.result.failed)) {
        console.error('Debug trace indicates failure:', debugResult.error || debugResult.result);
      }
    } catch (err) {
      console.error('debug_traceCall failed:', err?.message || err);
    }

    // Try a VM trace (no tracer) to get structLogs/PC if supported
    console.log('\nAttempting VM trace (no tracer)...');
    try {
      const vmTraceBody = {
        jsonrpc: '2.0',
        method: 'debug_traceCall',
        params: [
          { from, to: contractAddress, data, gas: txObj.gas, nonce: txObj.nonce },
          'latest',
          {}
        ],
        id: Number('0x' + crypto.randomBytes(2).toString('hex')),
      };
      const vmTrace = await postJson(DEBUG_RPC_URL, vmTraceBody);
      if (vmTrace?.result?.structLogs?.length) {
        const logs = vmTrace.result.structLogs;
        console.log(`VM structLogs length: ${logs.length}`);
        // Find last REVERT/INVALID and print a large window leading up to it
        let lastIdx = logs.length - 1;
        for (let i = logs.length - 1; i >= 0; i--) {
          const op = (logs[i].op || '').toUpperCase();
          if (op === 'REVERT' || op === 'INVALID') { lastIdx = i; break; }
        }
        const start = Math.max(0, lastIdx - 200);
        const window = logs.slice(start, lastIdx + 1);
        console.log(`\nLast ${window.length} ops leading to revert (from index ${start} to ${lastIdx}):`);
        console.log(JSON.stringify(window, null, 2));

        // Heuristic: highlight arithmetic ops near the end that could overflow
        const OVERFLOW_LIMIT = (1n << 256n) - 1n;
        const arith = new Set(['MUL','ADD','SUB','DIV','SDIV','MOD','SMOD','EXP','SHL','SHR']);
        const candidates = [];
        function toBig(x){
          try { return BigInt(x); } catch { return null; }
        }
        // Also try to find the Panic selector being written, then scan backwards more aggressively
        let panicIdx = lastIdx;
        for (let i = logs.length - 1; i >= 0; i--) {
          const st = logs[i].stack || [];
          if (st.some(v => (v+'').toLowerCase().startsWith('0x4e487b71'))) { panicIdx = i; break; }
        }

        const scanStart = Math.max(0, panicIdx - 1000);
        for (let i = scanStart; i < panicIdx; i++) {
          const entry = window[i];
          const entryGlobal = logs[start + (i - scanStart)];
          const e = entry || entryGlobal || logs[i];
          const op = (e.op||'').toUpperCase();
          if (!arith.has(op)) continue;
          const st = e.stack || [];
          const top = st[st.length-1];
          const sec = st[st.length-2];
          const a = toBig(top);
          const b = toBig(sec);
          let note = '';
          if (op === 'MUL' && a != null && b != null) {
            if (a !== 0n && b !== 0n) {
              // check overflow: a*b > OVERFLOW_LIMIT
              const bitsA = a.toString(2).length;
              const bitsB = b.toString(2).length;
              if (bitsA + bitsB > 256) note = 'POSSIBLE OVERFLOW (bit-length heuristic)';
            }
          } else if (op === 'ADD' && a != null && b != null) {
            // overflow if a+b > LIMIT
            if (a > 0n && b > 0n) {
              // if high bits set, mark
              const bitsA = a.toString(2).length;
              const bitsB = b.toString(2).length;
              if (Math.max(bitsA, bitsB) >= 256) note = 'POSSIBLE OVERFLOW (operand too large)';
            }
          }
          if (note) {
            candidates.push({ idx: i, pc: e.pc, op, stackTop: top, stackSecond: sec, note });
          }
        }
        if (candidates.length) {
          console.log('\nHeuristic overflow candidates near revert:');
          // Print last 20 candidates for better context
          console.log(JSON.stringify(candidates.slice(-20), null, 2));
        } else {
          console.log('\nNo obvious arithmetic-overflow candidates found by heuristic.');
        }
      } else {
        console.log('VM trace not available on this debug endpoint.');
      }
    } catch (e) {
      console.log('VM trace request failed:', e?.message || e);
    }
  }

  // Also try a direct call (read) to show revert reason if any
  console.log('\nAttempting eth_call for pendingReward...');
  try {
    const res = await provider.call({ to: contractAddress, data }, 'latest');
    console.log('eth_call result:', res);
    try {
      const [decoded] = iface.decodeFunctionResult(usedSig, res);
      console.log('Decoded', usedSig + ':', decoded.toString());
    } catch (e) {
      console.log('Decode failed:', e?.message || e);
    }
  } catch (e) {
    console.error('eth_call reverted:', e?.reason || e?.message || e);
  }
}

main().catch((e) => {
  console.error('Fatal:', e?.message || e);
  process.exit(1);
});
