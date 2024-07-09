import { QueueConfigType } from '@diia-inhouse/diia-queue'

import { ExternalEvent, ExternalTopic, InternalEvent, InternalQueueName, InternalTopic, ScheduledTaskQueueName } from '@interfaces/queue'

export default {
    portalEvents: [],
    internalEvents: Object.values(InternalEvent),
    queuesConfig: {
        [QueueConfigType.Internal]: {
            [InternalQueueName.QueueCriminalCert]: {
                topics: [],
            },
            [ScheduledTaskQueueName.ScheduledTasksQueueCriminalCert]: {
                topics: [InternalTopic.TopicScheduledTasks],
            },
        },
    },
    servicesConfig: {
        [QueueConfigType.Internal]: {
            subscribe: [ScheduledTaskQueueName.ScheduledTasksQueueCriminalCert, InternalQueueName.QueueCriminalCert],
            publish: [InternalTopic.TopicCriminalCertLifeCycle, InternalTopic.TopicAnalytics],
        },
        [QueueConfigType.External]: {
            subscribe: [],
            publish: [
                ExternalEvent.PublicServiceCriminalRecordCertOrder,
                ExternalEvent.PublicServiceCriminalRecordCertDownload,
                ExternalEvent.PublicServiceCriminalRecordCertOrderResult,
            ],
        },
    },
    topicsConfig: {
        [QueueConfigType.Internal]: {
            [InternalTopic.TopicCriminalCertLifeCycle]: {
                events: [InternalEvent.CriminalCertificateStatusUpdated],
            },
            [InternalTopic.TopicAnalytics]: {
                events: [InternalEvent.RateService],
            },
        },
        [QueueConfigType.External]: {
            [ExternalTopic.Repo]: {
                events: [
                    ExternalEvent.PublicServiceCriminalRecordCertOrder,
                    ExternalEvent.PublicServiceCriminalRecordCertDownload,
                    ExternalEvent.PublicServiceCriminalRecordCertOrderResult,
                ],
            },
        },
    },
}
