import { type ClassValue, clsx } from 'clsx';
import { quais } from 'quais';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- data formatting ---- //

export const shortenAddress = (address: string) => {
  if (address === '') return '';
  return address.slice(0, 5) + '...' + address.slice(-4);
};

export const sortedQuaiShardNames: ShardNames = {
  '0x00': { name: 'Cyprus-1', rpcName: 'cyprus1' },
  '0x01': { name: 'Cyprus-2', rpcName: 'cyprus2' },
  '0x02': { name: 'Cyprus-3', rpcName: 'cyprus3' },
  '0x10': { name: 'Paxos-1', rpcName: 'paxos1' },
  '0x11': { name: 'Paxos-2', rpcName: 'paxos2' },
  '0x12': { name: 'Paxos-3', rpcName: 'paxos3' },
  '0x20': { name: 'Hydra-1', rpcName: 'hydra1' },
  '0x21': { name: 'Hydra-2', rpcName: 'hydra2' },
  '0x22': { name: 'Hydra-3', rpcName: 'hydra3' },
};

export const buildTransactionUrl = (shardName: string, txHash: string) => {
  return `https://${shardName}.colosseum.quaiscan.io/tx/${txHash}`;
};

export const ShardData = [
  {
    name: 'Cyprus-1',
    shard: 'zone-0-0',
    context: 2,
    byte: ['00', '1d'],
  },
  {
    name: 'Cyprus-2',
    shard: 'zone-0-1',
    context: 2,
    byte: ['1e', '3a'],
  },
  {
    name: 'Cyprus-3',
    shard: 'zone-0-2',
    context: 2,
    byte: ['3b', '57'],
  },
  {
    name: 'Paxos-1',
    shard: 'zone-1-0',
    context: 2,
    byte: ['58', '73'],
  },
  {
    name: 'Paxos-2',
    shard: 'zone-1-1',
    context: 2,
    byte: ['74', '8f'],
  },
  {
    name: 'Paxos-3',
    shard: 'zone-1-2',
    context: 2,
    byte: ['90', 'AB'],
  },
  {
    name: 'Hydra-1',
    shard: 'zone-2-0',
    context: 2,
    byte: ['AC', 'C7'],
  },
  {
    name: 'Hydra-2',
    shard: 'zone-2-1',
    context: 2,
    byte: ['C8', 'E3'],
  },
  {
    name: 'Hydra-3',
    shard: 'zone-2-2',
    context: 2,
    byte: ['E4', 'FF'],
  },
];

export const allowedZones = ['0x00'];
export function isQuaiAddressGoldenCyprusOne(address: string): boolean {
  if (quais.isQuaiAddress(address)) {
    const testAddressZone = quais.getZoneForAddress(address) || '';
    return allowedZones.includes(testAddressZone);
  }
  return false;
}
