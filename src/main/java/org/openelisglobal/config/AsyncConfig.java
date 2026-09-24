package org.openelisglobal.config;

import jakarta.annotation.Nullable;
import java.util.concurrent.Executor;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.task.SimpleAsyncTaskExecutor;
import org.springframework.scheduling.annotation.AsyncConfigurerSupport;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

@Configuration
@EnableAsync
public class AsyncConfig extends AsyncConfigurerSupport {
    @Override
    public Executor getAsyncExecutor() {
        SimpleAsyncTaskExecutor executor = new SimpleAsyncTaskExecutor();
        executor.setTaskDecorator(new UserContextPropagatingTaskDecorator());
        return executor;
    }

    @Bean(name = "externalPatientSearchExecutor")
    public ThreadPoolTaskExecutor externalPatientSearchExecutor(
            @Value("${org.openelisglobal.externalSearch.executor.corePoolSize:2}") int corePoolSize,
            @Value("${org.openelisglobal.externalSearch.executor.maxPoolSize:4}") int maxPoolSize,
            @Value("${org.openelisglobal.externalSearch.executor.queueCapacity:50}") int queueCapacity) {
        if (corePoolSize < 1 || maxPoolSize < corePoolSize || queueCapacity < 1) {
            throw new IllegalArgumentException("External patient search executor sizes are invalid");
        }
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(corePoolSize);
        executor.setMaxPoolSize(maxPoolSize);
        executor.setQueueCapacity(queueCapacity);
        executor.setThreadNamePrefix("external-patient-search-");
        executor.setTaskDecorator(new UserContextPropagatingTaskDecorator());
        return executor;
    }

    @Override
    @Nullable
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        return new AsyncExceptionHandler();
    }
}
