// Dependencies
// Types
import { SubscriptionOptions } from "../pubSubService";

// Async Interator and GraphQL Subscription Conformance
import { $$asyncIterator } from "iterall";
import { PubSubEngine } from "graphql-subscriptions";

/**
 * A class for digesting PubSubEngine events via the new AsyncIterator interface.
 * This implementation is a generic version of the one located at
 * https://github.com/apollographql/graphql-subscriptions/blob/master/src/event-emitter-to-async-iterator.ts
 * @class
 *
 * @constructor
 *
 * @property pullQueue @type {Function[]}
 * A queue of resolve functions waiting for an incoming event which has not yet arrived.
 * This queue expands as next() calls are made without PubSubEngine events occurring in between.
 *
 * @property pushQueue @type {any[]}
 * A queue of PubSubEngine events waiting for next() calls to be made.
 * This queue expands as PubSubEngine events arrice without next() calls occurring in between.
 *
 * @property eventsArray @type {string[]}
 * An array of PubSubEngine event names which this PubSubAsyncIterator should watch.
 *
 * @property allSubscribed @type {Promise<number[]>}
 * A promise of a list of all subscription ids to the passed PubSubEngine.
 *
 * @property listening @type {boolean}
 * Whether or not the PubSubAsynIterator is in listening mode
 * (responding to incoming PubSubEngine events and next() calls).
 * Listening begins as true and turns to false once the return method is called.
 *
 * @property pubsub @type {PubSubEngine}
 * The PubSubEngine whose events will be observed.
 *
 * @property options @type {any}
 * Additional options which get passed through for the client.
 */
export class PubSubAsyncIterator<T> implements AsyncIterator<T> {
  // Properties
  private pullQueue: Function[];
  private pushQueue: any[];
  private eventsArray: string[];
  private allSubscribed: Promise<number[]>;
  private listening: boolean;
  private pubsub: PubSubEngine;
  private options: SubscriptionOptions;

  constructor(
    pubSubEngine: PubSubEngine,
    topicNames: string | string[],
    options: any
  ) {
    this.pubsub = pubSubEngine;
    this.pullQueue = [];
    this.pushQueue = [];
    this.listening = true;
    this.eventsArray =
      typeof topicNames === "string" ? [topicNames] : topicNames;
    this.options = options;
    this.allSubscribed = this.subscribeAll();
  }

  public async next() {
    await this.allSubscribed;
    return this.listening ? this.pullValue() : this.return();
  }

  public async return(): Promise<{ value: any; done: boolean }> {
    this.emptyQueue(await this.allSubscribed);
    return { value: undefined, done: true };
  }

  public async throw(error: any) {
    this.emptyQueue(await this.allSubscribed);
    return Promise.reject(error);
  }

  public [$$asyncIterator]() {
    return this;
  }

  private async pushValue<T extends string, K extends string | number>(
    event: Record<T, K>
  ) {
    await this.allSubscribed;

    if (this.pullQueue.length !== 0) {
      this.pullQueue.shift()?.({ value: event, done: false });
    } else {
      this.pushQueue.push(event);
    }
  }

  private pullValue(): Promise<IteratorResult<any>> {
    return new Promise((resolve) => {
      if (this.pushQueue.length !== 0) {
        resolve({ value: this.pushQueue.shift(), done: false });
      } else {
        this.pullQueue.push(resolve);
      }
    });
  }

  private emptyQueue(connectionIDs: number[]) {
    if (this.listening) {
      // Stop listening
      this.listening = false;
      this.unsubscribeAll(connectionIDs);

      // Pull
      this.pullQueue.forEach((resolve) =>
        resolve({ value: undefined, done: true })
      );
      this.pullQueue.length = 0;

      // Push
      this.pushQueue.length = 0;
    }
  }

  private subscribeAll() {
    return Promise.all(
      this.eventsArray.map((eventName) => {
        return this.pubsub.subscribe(
          eventName,
          this.pushValue.bind(this),
          this.options
        );
      })
    );
  }

  private unsubscribeAll(connectionIDs: number[]) {
    for (const connectionID of connectionIDs) {
      this.pubsub.unsubscribe(connectionID);
    }
  }
}
