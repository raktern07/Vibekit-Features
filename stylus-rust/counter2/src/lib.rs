// Allow `cargo stylus export-abi` to generate a main function.
#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

/// Import items from the SDK. The prelude contains common traits and macros.
use stylus_sdk::{contract, evm, msg, prelude::*, call::{Call, call}, alloy_primitives::{Address, U256}, abi::Bytes};
use alloy_sol_types::sol;

// Define essential events only
sol! {
    error AlreadyInitialized();
    error InvalidInput();
    error NotOwner();
    error TxDoesNotExist();
    error TxAlreadyExecuted();
    error TxAlreadyConfirmed();
    error TxNotConfirmed();
    error NotEnoughConfirmations();
    error ExecuteFailed();
}

// Define persistent storage
sol_storage! {
    #[entrypoint]
    pub struct MultiSig {
        address[] owners;
        mapping(address => bool) is_owner;
        uint256 num_confirmations_required;
        TxStruct[] transactions;
        mapping(uint256 => mapping(address => bool)) is_confirmed;
    }

    pub struct TxStruct {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 num_confirmations;
    }
}

// Essential error types only
#[derive(SolidityError)]
pub enum MultiSigError {
    AlreadyInitialized(AlreadyInitialized),
    InvalidInput(InvalidInput),
    NotOwner(NotOwner),
    TxDoesNotExist(TxDoesNotExist),
    TxAlreadyExecuted(TxAlreadyExecuted),
    TxAlreadyConfirmed(TxAlreadyConfirmed),
    TxNotConfirmed(TxNotConfirmed),
    NotEnoughConfirmations(NotEnoughConfirmations),
    ExecuteFailed(ExecuteFailed),
}

/// Core multisig functionality only
#[public]
impl MultiSig {
    pub fn initialize(&mut self, owners: Vec<Address>, num_confirmations_required: U256) -> Result<(), MultiSigError> {
        if self.owners.len() > 0 {
            return Err(MultiSigError::AlreadyInitialized(AlreadyInitialized{}));
        }

        if owners.len() == 0 || num_confirmations_required == U256::from(0) || num_confirmations_required > U256::from(owners.len()) {
            return Err(MultiSigError::InvalidInput(InvalidInput{}));
        }

        for owner in owners.iter() {
            if *owner == Address::default() || self.is_owner.get(*owner) {
                return Err(MultiSigError::InvalidInput(InvalidInput{}));
            }
            self.is_owner.setter(*owner).set(true);
            self.owners.push(*owner);
        }

        self.num_confirmations_required.set(num_confirmations_required);
        Ok(())
    }

    pub fn submit_transaction(&mut self, to: Address, value: U256, data: Bytes) -> Result<(), MultiSigError> {
        if !self.is_owner.get(msg::sender()) {
            return Err(MultiSigError::NotOwner(NotOwner{}));
        }

        let mut new_tx = self.transactions.grow();
        new_tx.to.set(to);
        new_tx.value.set(value);
        new_tx.data.set_bytes(data);
        new_tx.executed.set(false);
        new_tx.num_confirmations.set(U256::from(0));
        Ok(())
    }

    pub fn confirm_transaction(&mut self, tx_index: U256) -> Result<(), MultiSigError> {
        if !self.is_owner.get(msg::sender()) {
            return Err(MultiSigError::NotOwner(NotOwner{}));
        }

        if tx_index >= U256::from(self.transactions.len()) {
            return Err(MultiSigError::TxDoesNotExist(TxDoesNotExist{}));
        }

        if let Some(mut entry) = self.transactions.get_mut(tx_index) {
            if entry.executed.get() {
                return Err(MultiSigError::TxAlreadyExecuted(TxAlreadyExecuted{}));
            }

            if self.is_confirmed.get(tx_index).get(msg::sender()) {
                return Err(MultiSigError::TxAlreadyConfirmed(TxAlreadyConfirmed{}));
            }

            let num_confirmations = entry.num_confirmations.get();
            entry.num_confirmations.set(num_confirmations + U256::from(1));
            
            let mut tx_confirmed_info = self.is_confirmed.setter(tx_index);
            let mut confirmed_by_address = tx_confirmed_info.setter(msg::sender());
            confirmed_by_address.set(true);
            Ok(())
        } else {
            return Err(MultiSigError::TxDoesNotExist(TxDoesNotExist{}));
        }
    }

    pub fn execute_transaction(&mut self, tx_index: U256) -> Result<(), MultiSigError>{
        if !self.is_owner.get(msg::sender()) {
            return Err(MultiSigError::NotOwner(NotOwner{}));
        }

        let tx_index = tx_index.to::<usize>();
        if tx_index >= self.transactions.len() {
            return Err(MultiSigError::TxDoesNotExist(TxDoesNotExist{}));
        }

        // Extract values first to avoid borrowing conflicts
        let (to_addr, value, data) = {
            if let Some(mut entry) = self.transactions.get_mut(tx_index) {
                if entry.executed.get() {
                    return Err(MultiSigError::TxAlreadyExecuted(TxAlreadyExecuted{}));
                }

                if entry.num_confirmations.get() < self.num_confirmations_required.get() {
                    return Err(MultiSigError::NotEnoughConfirmations(NotEnoughConfirmations{}));
                }
                
                entry.executed.set(true);
                (entry.to.get(), entry.value.get(), entry.data.get_bytes())
            } else {
                return Err(MultiSigError::TxDoesNotExist(TxDoesNotExist{}));
            }
        };

        // Now make the call with extracted values
        match call(Call::new_in(self).value(value), to_addr, &data) {
            Ok(_) => Ok(()),
            Err(_) => Err(MultiSigError::ExecuteFailed(ExecuteFailed{}))
        }
    }

    pub fn is_owner(&self, check_address: Address) -> bool {
        self.is_owner.get(check_address)
    }
}