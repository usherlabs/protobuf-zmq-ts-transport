import { defer, firstValueFrom, from } from "rxjs";
import * as zmq from "zeromq";
import { Publisher, Subscriber } from "zeromq";
import { ZQMClientTransport } from "../src/ZMQTransport";
import { describe, expect, test as rawTest } from "vitest";
import { MyServerServiceClient } from "./generated/test_service.client";
import {
  MyRequestInput,
  MyRequestResult,
  SubscriptionItem,
} from "./generated/test_service";

const socketsDirectory = process.env.ZMQ_SOCKETS_DIR ?? "/tmp/test_sockets/";

const testPublishAddress = `ipc://${socketsDirectory}test_pub`;
const testRequestAddress = `ipc://${socketsDirectory}test_req`;

const test = rawTest.extend<{
  pub: Publisher;
  sub: Subscriber;
  req: zmq.Dealer;
  transport: ZQMClientTransport;
}>({
  pub: async ({}, use) => {
    const pub = new zmq.Publisher();
    await pub.bind(testPublishAddress);
    await use(pub);
    await pub.unbind(testPublishAddress);
  },
  sub: async ({}, use) => {
    const sub = new zmq.Subscriber();
    sub.connect(testPublishAddress);
    await use(sub);
    sub.disconnect(testPublishAddress);
  },
  req: async ({}, use) => {
    const req = new zmq.Dealer();
    req.connect(testRequestAddress);
    await use(req);
    req.disconnect(testRequestAddress);
  },
  transport: async ({ sub, req }, use) => {
    const zqmClientTransport = new ZQMClientTransport(sub, req);
    const subscription = zqmClientTransport.start();
    await use(zqmClientTransport);
    subscription.unsubscribe();
  },
});

describe("transport", () => {
  test("subscription with active server", async ({ sub, transport }) => {
    const client = new MyServerServiceClient(transport);

    const response$ = from(client.subscribeToItems({}).responses);

    const firstResponsePromise = firstValueFrom(response$);

    expect(await firstResponsePromise).toStrictEqual({
      data: "any_data",
    } satisfies SubscriptionItem);
  });

  test("request client with active server", async ({ sub, req }) => {
    const zqmClientTransport = new ZQMClientTransport(sub, req);
    zqmClientTransport.start();

    const client = new MyServerServiceClient(zqmClientTransport);
    const item = MyRequestInput.create({
      timeToSleep: 1000,
    });

    const { response } = await client.myRequestMethod(item);
    expect(response).toStrictEqual({
      allOk: true,
      message: "ok after 1000ms",
    } satisfies MyRequestResult);
  });

  test("request client with interleaved messages with active server", async ({
    transport,
  }) => {
    const client = new MyServerServiceClient(transport);

    const call1 = client.myRequestMethod(
      MyRequestInput.create({
        timeToSleep: 2000,
      }),
    );
    const call2 = client.myRequestMethod(
      MyRequestInput.create({
        timeToSleep: 1000,
      }),
    );
    const { response: responseCall1 } = await call1;
    const { response: responseCall2 } = await call2;

    expect(responseCall1).toStrictEqual({
      allOk: true,
      message: "ok after 2000ms",
    } satisfies MyRequestResult);

    expect(responseCall2).toStrictEqual({
      allOk: true,
      message: "ok after 1000ms",
    } satisfies MyRequestResult);
  });
});
