export enum ExternalEvent {
    PublicServiceCriminalRecordCertOrder = 'public-service.criminal-record-cert.order',
    PublicServiceCriminalRecordCertDownload = 'public-service.criminal-record-cert.download',
    PublicServiceCriminalRecordCertOrderResult = 'public-service.criminal-record-cert.order.result',
}

export enum ExternalTopic {
    Repo = 'Repo',
}

export enum InternalEvent {
    CriminalCertificateStatusUpdated = 'criminal-certificate-status-updated',
    RateService = 'rate-service',
}

export enum InternalQueueName {
    QueueCriminalCert = 'QueueCriminalCert',
}

export enum InternalTopic {
    TopicAnalytics = 'TopicAnalytics',
    TopicCriminalCertLifeCycle = 'TopicCriminalCertLifeCycle',
    TopicScheduledTasks = 'TopicScheduledTasks',
}

export enum ScheduledTaskEvent {
    CriminalCertCheckCriminalRecordCertificateApplications = 'criminal-cert-check-criminal-record-certificate-applications',
}

export enum ScheduledTaskQueueName {
    ScheduledTasksQueueCriminalCert = 'ScheduledTasksQueueCriminalCert',
}
