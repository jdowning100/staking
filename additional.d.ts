import { quais } from 'quais';

// this file is a global type/interface/class declaration file
// types/interfaces/classes declared here are available globally in the project without having to import directly

declare global {
  // ---- global ---- //
  interface Window {
    ethereum?: ExternalProvider;
    pelagus?: ExternalProvider;
  }

  // ---- data ---- //
  type web3Provider = quais.BrowserProvider | undefined;
  type account = { addr: string } | undefined;
  type accountType = 'iron' | 'golden';
  type NumericalShardName =
    | 'zone-0-0'
    | 'zone-0-1'
    | 'zone-0-2'
    | 'zone-1-0'
    | 'zone-1-1'
    | 'zone-1-2'
    | 'zone-2-0'
    | 'zone-2-1'
    | 'zone-2-2';
  type PlainTextShardName =
    | 'Cyprus-1'
    | 'Cyprus-2'
    | 'Cyprus-3'
    | 'Paxos-1'
    | 'Paxos-2'
    | 'Paxos-3'
    | 'Hydra-1'
    | 'Hydra-2'
    | 'Hydra-3';
  type RPCShardName =
    | 'cyprus1'
    | 'cyprus2'
    | 'cyprus3'
    | 'paxos1'
    | 'paxos2'
    | 'paxos3'
    | 'hydra1'
    | 'hydra2'
    | 'hydra3';
  type ShardNames = {
    [key: string]: { name: PlainTextShardName; rpcName: RPCShardName };
  };
}
