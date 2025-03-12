import { quais } from 'quais';

export const dispatchAccount = (accounts: Array<string>, dispatch: any) => {
  let account;
  if (accounts.length !== 0) {
    const shard = quais.getZoneForAddress(accounts[0]);
    account = {
      addr: accounts[0],
      shard: shard,
    };
    dispatch({ type: 'SET_ACCOUNT', payload: account });
  } else {
    account = undefined;
    dispatch({ type: 'SET_ACCOUNT', payload: account });
  }
  return account;
};
