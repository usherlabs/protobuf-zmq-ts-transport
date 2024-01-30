import {
  ClientStreamingCall,
  DuplexStreamingCall,
  MethodInfo,
  RpcOptions,
  RpcOutputStream,
  RpcOutputStreamController,
  RpcTransport,
  ServerStreamingCall,
  UnaryCall,
} from "@protobuf-ts/runtime-rpc";
import {
  EMPTY,
  filter,
  first,
  firstValueFrom,
  from,
  fromEventPattern,
  map,
  merge,
  Observable,
  share,
  Subject,
  Subscription,
  takeUntil,
  tap,
} from "rxjs";
import zmq from "zeromq";
import mergeObjects from "deepmerge";

export class ZQMClientTransport implements RpcTransport {
  private subscriptionMessageSubject = new Subject<[string, Uint8Array]>();
  private replyMessageSubject = new Subject<[string, Uint8Array]>();
  public start: () => Subscription;

  constructor(
    private sub: zmq.Subscriber,
    private dealer: zmq.Dealer,
  ) {
    const processSubMsgs = from(this.sub).pipe(
      // @ts-expect-error not conventional
      tap(([methodByte, data]: [Uint8Array, Uint8Array]) =>
        this.subscriptionMessageSubject.next([methodByte.toString(), data]),
      ),
    );
    const processReplyMsgs = from(this.dealer)
      // [requestId, response]
      .pipe(
        // @ts-expect-error not conventional
        tap(([requestIdByte, data]: [Uint8Array, Uint8Array]) =>
          this.replyMessageSubject.next([requestIdByte.toString(), data]),
        ),
      );
    const sideEffect$ = merge(processSubMsgs, processReplyMsgs);
    this.start = sideEffect$.subscribe.bind(sideEffect$);
  }

  mergeOptions(options?: Partial<RpcOptions>): RpcOptions {
    const defaultOptions: RpcOptions = {};
    return mergeObjects(defaultOptions, options ?? {});
  }

  unary<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: RpcOptions,
  ): UnaryCall<I, O> {
    const { abort } = options;

    const requestId = Math.random().toString(36).substring(7);

    // Send the request to the server
    // [null, requestId, method, input] -- it mimics the normal req rep shape, adding requestId
    this.dealer.send([
      null,
      requestId,
      method.name,
      method.I.toBinary(input, options.binaryOptions),
    ]);

    const abort$ = abort
      ? fromEventPattern(
          (handler) => abort.addEventListener("abort", handler),
          (handler) => abort.removeEventListener("abort", handler),
        )
      : EMPTY;

    // Create an observable that emits response messages
    const responseObservable = this.replyMessageSubject.pipe(
      filter(([responseId, _]) => responseId === requestId),
      map(([_, data]) => data),
      map((buf) => method.O.fromBinary(buf, options.binaryOptions)),
      takeUntil(abort$),
      first(),
    );

    // Create and return a UnaryCall object
    return new UnaryCall<I, O>(
      method,
      {}, // requestHeaders
      input,
      Promise.resolve({}), // headers
      firstValueFrom(responseObservable),
      Promise.resolve({ code: "OK", detail: "" }), // status
      Promise.resolve({}), // trailers
    );
  }

  serverStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    input: I,
    options: RpcOptions,
  ): ServerStreamingCall<I, O> {
    const { abort } = options;

    // Send the request to the server
    this.sub.subscribe(method.name);

    const abort$ = abort
      ? fromEventPattern(
          (handler) => abort.addEventListener("abort", handler),
          (handler) => abort.removeEventListener("abort", handler),
        )
      : EMPTY;

    // Create an observable that emits response messages
    const responseObservable = this.subscriptionMessageSubject.pipe(
      filter(([name, _]) => name === method.name),
      map(([_, data]) => data),
      map((buf) => method.O.fromBinary(buf, options.binaryOptions)),
      filter(Boolean), // last are usually empty messages
      // tap({
      //     unsubscribe: () => this.sub.unsubscribe(method.name),
      // }),
      // takeUntil(abort$),
      share(),
    );

    // Create and return a ServerStreamingCall object
    return new ServerStreamingCall<I, O>(
      method,
      {}, // requestHeaders
      input,
      Promise.resolve({}), // headers
      rpcOutputFromObservable(responseObservable),
      Promise.resolve({ code: "OK", detail: "" }), // status
      Promise.resolve({}), // trailers
    );
  }

  clientStreaming<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: RpcOptions,
  ): ClientStreamingCall<I, O> {
    throw new Error("Method not implemented.");
  }

  duplex<I extends object, O extends object>(
    method: MethodInfo<I, O>,
    options: RpcOptions,
  ): DuplexStreamingCall<I, O> {
    throw new Error("Method not implemented.");
  }
}

const rpcOutputFromObservable = <T extends object>(
  observable: Observable<T>,
): RpcOutputStream<T> => {
  const controller = new RpcOutputStreamController<T>();

  observable.subscribe({
    next: (message) => controller.notifyMessage(message),
    error: (error) => controller.notifyError(error),
    complete: () => controller.notifyComplete(),
  });

  return controller;
};
