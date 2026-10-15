/** Only recorded text crosses the Host producer / Client adapter test boundary. */
export interface DetailsProducerOutput {
  terminalsEmpty: string
  terminals: string
  spawn: string
  read: string
  jobCompleted: string
  jobExit: string
  sessionSearch: string
  eventSearch: string
  trace: string
  eventTrace: string
  eventRead: string
}

export interface DetailsProducerFixture {
  produceDetails(): DetailsProducerOutput
}
