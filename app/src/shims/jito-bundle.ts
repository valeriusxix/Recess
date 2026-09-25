/** The live path does not send Jito bundles. This keeps that client out of the browser build. */
export class Bundle {
  addTransactions(): this {
    return this;
  }
  addTipTx(): this {
    return this;
  }
}
