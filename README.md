# protobuf-zmq-ts-transport

This is a package that allows you to use the [`protobuf-ts`](https://github.com/timostamm/protobuf-ts) library and [ZeroMQ](https://zeromq.org/) messaging system together, aiding in efficient data transmission between processes via sockets. It supports both the pub-sub and request-reply patterns.

Originally designed to facilitate communication between a NodeJS client and a Rust server, this package can be adapted to any language that adheres to this protocol.

## How to Use

Follow these steps to make use of this library:

1. Refer to the [protobuf-ts documentation](https://github.com/timostamm/protobuf-ts#quickstart) to generate a client file for your `.proto` services.
2. Establish and connect a `SUB` and `DEALER` ZeroMQ socket.
3. Construct a `ZMQClientTransport` object and pass it as an argument when creating a service client.
4. Make sure a service is operational and capable of either publishing data or responding to requests.
5. Activate any method from the client to either subscribe to a certain topic or request data.

For more comprehensive examples, refer to our test files.

## Implementation Details
In this section, we will discuss the design decisions that went into this package. It's not necessary to understand every detail to use this package, but it may be helpful to understand its limitations.

### Solution Goals

- Facilitate inter-process communication while minimizing required modifications when extending the API.
- Ensure type safety.
- Offer the ability to create a data stream across different subscribed processes.
- Simplify the creation of asynchronous request-reply tasks between processes.

Given these, we have 2 patterns in operation:

### 1. Pub/Sub Pattern

- A PUBLISHER application binds to a socket. Any number of SUBSCRIBER applications can connect.
- For communication, the ZMQ frame protocol should be: `[methodName, Output]`, in bytes
    ```proto
    message EmptyInput {}

    message SubscriptionItem {
      string data = 1;
    }

    service MyServerService {
      rpc SubscribeToItems(EmptyInput) returns (stream SubscriptionItem) {}
    }
    ```

The data transferred should be `["SubscribeToItems", SubscriptionItem]`.

- Pub-sub methods should start with "SubscribeTo...". Later we will provide a idiomatic way to define this leveraging protobuf options.
- Clients can subscribe and filter events using the `methodName` message.
- The `.proto` file defined return type should be a data stream.

### 2. Request/Reply Pattern

- ROUTER/DEALER sockets are used to allow asynchronous requests.
- A server should handle multiple requests concurrently.
- The ZMQ frame protocol should be: `[requestId, BLANK, methodName, Input]`, in bytes. The server should reply
  with `[clientId, requestId, Output]`
    ```proto
    message MyRequestInput {
      int32 time_to_sleep = 1;
    }

    message MyRequestResult {
      bool all_ok = 1;
      string message = 2;
    }

    service MyServerService {
        rpc MyRequestMethod(MyRequestInput) returns (MyRequestResult) {}
    }
    ```
  The transferred data for this example should be `[requestId, BLANK, "MyRequestMethod", MyRequestInput]`.
    - `requestId` is a randomly generated string by the client
    - `BLANK` is an empty frame, used to mimic the original protocol for REQUEST/REPLY patterns.
    - `clientId` is included by default by clients. ROUTER should also include this in the reply to ensure the correct
      dispatching of the reply to a client.

It's possible to use both patterns on the same service:

Note: Currently, we only support building Client implementations with this package. Future updates may include Server
implementations.

## Resources
- [protobuf-zmq-rust-generator](https://github.com/usherlabs/protobuf-zmq-rust-generator): The Rust implementation that permits us to communicate using this protocol
- [ZeroMQ](https://zeromq.org/): The messaging library used to transmit data between processes
- [protobuf-ts](https://github.com/timostamm/protobuf-ts): The protobuf library used to generate the client files

## Contributing

We welcome contributions to this project!