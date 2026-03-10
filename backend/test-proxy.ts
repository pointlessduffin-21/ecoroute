const handler = {
  get(target: any, prop: string) {
    if (prop === "then") {
      return (resolve: any) => resolve([{ id: "mock-id", count: 1 }]);
    }
    return new Proxy(() => {}, handler);
  },
  apply(target: any, thisArg: any, argumentsList: any[]) {
    return new Proxy(() => {}, handler);
  }
};
const mockDb = new Proxy(() => {}, handler) as any;

async function run() {
  const res = await mockDb.select().from("table").where("cond").limit(1);
  console.log(res);
}
run();
